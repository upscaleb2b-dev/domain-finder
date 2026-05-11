/**
 * Scans a domain batch for availability and service signals.
 * Supports parallel workers via ?worker=N&workers=10.
 * Worker 0 owns Redis state; workers 1–N scan only.
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

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '300');
const HIT_THRESHOLD = 40;

type DomainOutcome =
  | { tag: 'result'; data: ScanResult }
  | { tag: 'registered' }
  | { tag: 'skip' };

async function scanDomain(domain: string): Promise<DomainOutcome> {
  const rdap = await getRDAPInfo(domain);
  if (rdap.error) return { tag: 'skip' };
  if (!rdap.available && !rdap.pendingDrop) return { tag: 'registered' };

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

async function saveHits(results: ScanResult[]) {
  const hits = results.filter(r => r.score >= HIT_THRESHOLD);
  if (hits.length === 0) return 0;

  const existing: ScanResult[] = (await kv.get('hits')) || [];
  const existingDomains = new Set(existing.map(h => h.domain));
  const newHits = hits.filter(h => !existingDomains.has(h.domain));
  if (newHits.length === 0) return 0;

  const updatedExisting = existing.map(h => {
    const rescanned = results.find(r => r.domain === h.domain);
    return rescanned ? { ...rescanned, bought: h.bought } : h;
  });
  const combined = [
    ...newHits,
    ...updatedExisting.filter(h => !newHits.some(n => n.domain === h.domain)),
  ].slice(0, 1000);
  await kv.set('hits', combined);
  await sendHitEmail(newHits).catch(err => console.error('Email error:', err));
  return newHits.length;
}

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const worker = parseInt(searchParams.get('worker') || '0');
  const workers = parseInt(searchParams.get('workers') || '1');
  const isPrimary = worker === 0;

  try {
    // 1 Redis command to load both values
    const [domainList, storedIndex] = await kv.mget<[string[], number]>('domains', 'scan_index');
    let domainArr: string[] = domainList || [];
    let currentIndex: number = storedIndex || 0;

    if (domainArr.length === 0) {
      return NextResponse.json({ message: 'No domains queued. Discover cron will populate them.' });
    }

    if (currentIndex >= domainArr.length) currentIndex = 0;

    // Each worker scans a different non-overlapping window
    const windowStart = (currentIndex + worker * BATCH_SIZE) % domainArr.length;
    const batch = domainArr.slice(windowStart, windowStart + BATCH_SIZE);

    const outcomes = await Promise.all(
      batch.map(d => scanDomain(d).then(outcome => ({ domain: d, outcome })))
    );

    const registeredSet = new Set(
      outcomes.filter(o => o.outcome.tag === 'registered').map(o => o.domain)
    );
    const results = outcomes
      .filter((o): o is { domain: string; outcome: { tag: 'result'; data: ScanResult } } =>
        o.outcome.tag === 'result')
      .map(o => o.outcome.data);

    const newHitsCount = await saveHits(results);

    // Primary worker owns all state mutations
    if (isPrimary) {
      if (registeredSet.size > 0) {
        domainArr = domainArr.filter(d => !registeredSet.has(d));
      }
      const nextIndex = (currentIndex + workers * BATCH_SIZE) % domainArr.length;
      const logEntry = {
        timestamp: new Date().toISOString(),
        scanned: batch.length,
        available: results.length,
        pruned: registeredSet.size,
        skipped: outcomes.filter(o => o.outcome.tag === 'skip').length,
        hits: newHitsCount,
        batchStart: currentIndex,
        workers,
      };
      const prevLog: typeof logEntry[] = (await kv.get('scan_log')) || [];
      await Promise.all([
        kv.set('domains', domainArr),
        kv.set('scan_index', nextIndex),
        kv.set('last_scan', logEntry),
        kv.set('scan_log', [logEntry, ...prevLog].slice(0, 50)),
      ]);
    }

    return NextResponse.json({
      success: true,
      worker,
      scanned: batch.length,
      available: results.length,
      pruned: registeredSet.size,
      hits: newHitsCount,
    });
  } catch (err: any) {
    console.error('Scan error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
