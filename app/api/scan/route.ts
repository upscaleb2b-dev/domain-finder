/**
 * Scans a batch of domains for active legacy Google Apps signals.
 * Skip cache (7-day TTL) prevents re-checking registered domains.
 * Availability check runs first — registered domains are cached and skipped.
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

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '100');
const HIT_THRESHOLD = 40;
const SKIP_TTL = 604800; // 7 days

async function scanDomain(domain: string): Promise<ScanResult | null> {
  const rdap = await getRDAPInfo(domain);
  if (!rdap.available && !rdap.pendingDrop) return null;

  const [googleMX, legacyCNAME, startCNAME, spfGoogle, adminResult] =
    await Promise.all([
      hasGoogleMX(domain),
      hasLegacyCNAME(domain),
      hasStartCNAME(domain),
      hasSpfGoogle(domain),
      checkAdminConsole(domain),
    ]);

  if (adminResult.redFlag) return null;

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
  return { ...partial, score, timestamp: new Date().toISOString(), bought: false };
}

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const domainList: string[] = (await kv.get('domains')) || [];
    let currentIndex: number = (await kv.get('scan_index')) || 0;

    if (domainList.length === 0) {
      return NextResponse.json({ message: 'No domains queued. Discover cron will populate them.' });
    }

    if (currentIndex >= domainList.length) currentIndex = 0;
    const batch = domainList.slice(currentIndex, currentIndex + BATCH_SIZE);

    // Batch-check skip cache (1 Redis command for whole batch)
    const skipKeys = batch.map(d => `skip:${d}`);
    const skipStatuses = await kv.mget<(string | null)[]>(...skipKeys);
    const toScan = batch.filter((_, i) => !skipStatuses[i]);
    const alreadySkipped = batch.length - toScan.length;

    // Scan only uncached domains
    const rawResults = await Promise.all(toScan.map(d => scanDomain(d)));

    // Cache registered domains (null return = still registered)
    const registeredDomains = toScan.filter((_, i) => rawResults[i] === null);
    if (registeredDomains.length > 0) {
      const pipe = kv.pipeline();
      registeredDomains.forEach(d => pipe.set(`skip:${d}`, '1', { ex: SKIP_TTL }));
      await pipe.exec();
    }

    const results = rawResults.filter((r): r is ScanResult => r !== null);
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

    const newIndex = currentIndex + BATCH_SIZE;
    const logEntry = {
      timestamp: new Date().toISOString(),
      scanned: toScan.length,
      available: results.length,
      skipped: alreadySkipped + registeredDomains.length,
      hits: hits.length,
      batchStart: currentIndex,
    };
    const prevLog: typeof logEntry[] = (await kv.get('scan_log')) || [];
    await Promise.all([
      kv.set('scan_index', newIndex >= domainList.length ? 0 : newIndex),
      kv.set('last_scan', logEntry),
      kv.set('scan_log', [logEntry, ...prevLog].slice(0, 50)),
    ]);

    return NextResponse.json({
      success: true,
      scanned: toScan.length,
      cacheSkipped: alreadySkipped,
      available: results.length,
      skipped: registeredDomains.length,
      hits: hits.length,
      nextIndex: newIndex >= domainList.length ? 0 : newIndex,
      totalDomains: domainList.length,
    });
  } catch (err: any) {
    console.error('Scan error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
