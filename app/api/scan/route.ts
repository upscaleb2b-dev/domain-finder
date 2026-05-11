/**
 * Scans a batch of domains for active legacy Google Apps signals.
 * Confirmed-registered domains are pruned from the queue (no TTL keys needed).
 * Runs every 5 minutes via GitHub Actions.
 */
import { NextResponse } from 'next/server';
import { kv } from '@/lib/kv';
import {
  hasGoogleMX, hasLegacyCNAME, hasStartCNAME,
  hasSpfGoogle, checkAdminConsole, getRDAPInfo,
} from '@/lib/dns';
import { computeScore, type ScanResult } from '@/lib/score';
import { sendHitEmail } from '@/lib/email';
import { verifyCronSecret } from '@/lib/auth';

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '200');
const HIT_THRESHOLD = 40;

type DomainOutcome =
  | { tag: 'result'; data: ScanResult }
  | { tag: 'registered' }   // confirmed by RDAP — safe to prune from queue
  | { tag: 'skip' };        // error/timeout/red-flag — keep in queue

async function scanDomain(domain: string): Promise<DomainOutcome> {
  const rdap = await getRDAPInfo(domain);

  // Network error — don't know status, keep for next cycle
  if (rdap.error) return { tag: 'skip' };

  // Confirmed registered — prune from queue
  if (!rdap.available && !rdap.pendingDrop) return { tag: 'registered' };

  // Full signal scan for available/dropping domains (all in parallel)
  const [googleMX, legacyCNAME, startCNAME, spfGoogle, adminResult] =
    await Promise.all([
      hasGoogleMX(domain),
      hasLegacyCNAME(domain),
      hasStartCNAME(domain),
      hasSpfGoogle(domain),
      checkAdminConsole(domain),
    ]);

  if (adminResult.redFlag) return { tag: 'skip' };

  const partial = {
    domain,
    available: rdap.available,
    pendingDrop: rdap.pendingDrop,
    googleMX,
    legacyCNAME,
    startCNAME,
    adminConsole: adminResult.active,
    spfGoogle,
    registrationYear: rdap.registrationYear,
  };
  const score = computeScore(partial);
  return { tag: 'result', data: { ...partial, score, timestamp: new Date().toISOString(), bought: false } };
}

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    let domainList: string[] = (await kv.get('domains')) || [];
    let currentIndex: number = (await kv.get('scan_index')) || 0;

    if (domainList.length === 0) {
      return NextResponse.json({ message: 'No domains queued. Discover cron will populate them.' });
    }

    if (currentIndex >= domainList.length) currentIndex = 0;
    const batch = domainList.slice(currentIndex, currentIndex + BATCH_SIZE);

    const outcomes = await Promise.all(batch.map((d, i) =>
      scanDomain(d).then(o => ({ domain: batch[i], outcome: o }))
    ));

    // Prune confirmed-registered domains from queue (1 Redis write vs N skip-cache writes)
    const registeredSet = new Set(
      outcomes.filter(o => o.outcome.tag === 'registered').map(o => o.domain)
    );
    if (registeredSet.size > 0) {
      domainList = domainList.filter(d => !registeredSet.has(d));
    }

    const results = outcomes
      .filter((o): o is { domain: string; outcome: { tag: 'result'; data: ScanResult } } =>
        o.outcome.tag === 'result')
      .map(o => o.outcome.data);
    const hits = results.filter(r => r.score >= HIT_THRESHOLD);

    if (hits.length > 0) {
      const existing: ScanResult[] = (await kv.get('hits')) || [];
      const existingDomains = new Set(existing.map(h => h.domain));
      const newHits = hits.filter(h => !existingDomains.has(h.domain));
      const updatedExisting = existing.map(h => {
        const rescanned = results.find(r => r.domain === h.domain);
        return rescanned ? { ...rescanned, bought: h.bought } : h;
      });
      const combined = [
        ...newHits,
        ...updatedExisting.filter(h => !newHits.some(n => n.domain === h.domain)),
      ].slice(0, 1000);
      await kv.set('hits', combined);

      if (newHits.length > 0) {
        await sendHitEmail(newHits).catch(err => console.error('Email error:', err));
      }
    }

    // Advance index; account for pruned entries shifting positions
    const newIndex = currentIndex + BATCH_SIZE - registeredSet.size;
    const nextIndex = newIndex >= domainList.length ? 0 : newIndex;

    const logEntry = {
      timestamp: new Date().toISOString(),
      scanned: batch.length,
      available: results.length,
      skipped: outcomes.filter(o => o.outcome.tag === 'skip').length,
      pruned: registeredSet.size,
      hits: hits.length,
      batchStart: currentIndex,
    };
    const prevLog: typeof logEntry[] = (await kv.get('scan_log')) || [];
    await Promise.all([
      kv.set('domains', domainList),
      kv.set('scan_index', nextIndex),
      kv.set('last_scan', logEntry),
      kv.set('scan_log', [logEntry, ...prevLog].slice(0, 50)),
    ]);

    return NextResponse.json({
      success: true,
      scanned: batch.length,
      available: results.length,
      pruned: registeredSet.size,
      skipped: outcomes.filter(o => o.outcome.tag === 'skip').length,
      hits: hits.length,
      nextIndex,
      totalDomains: domainList.length,
    });
  } catch (err: any) {
    console.error('Scan error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
