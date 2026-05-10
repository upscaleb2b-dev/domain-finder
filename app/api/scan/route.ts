/**
 * Scans a batch of domains for active legacy Google Apps signals.
 * Runs every hour via Vercel cron.
 */
import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';
import { hasGoogleMX, hasLegacyCNAME, hasStartCNAME, checkAdminConsole } from '@/lib/dns';
import { computeScore, type ScanResult } from '@/lib/score';
import { sendHitEmail } from '@/lib/email';
import { verifyCronSecret } from '@/lib/auth';

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '60');
const HIT_THRESHOLD = 40;

async function getRegistrationYear(domain: string): Promise<number | null> {
  try {
    // Use RDAP (free, no key needed)
    const tld = domain.split('.').pop();
    const res = await fetch(`https://rdap.org/domain/${domain}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const events: any[] = data.events || [];
    const reg = events.find((e: any) => e.eventAction === 'registration');
    if (!reg) return null;
    return new Date(reg.eventDate).getFullYear();
  } catch {
    return null;
  }
}

async function scanDomain(domain: string): Promise<ScanResult> {
  const [googleMX, legacyCNAME, startCNAME, adminConsole, registrationYear] = await Promise.all([
    hasGoogleMX(domain),
    hasLegacyCNAME(domain),
    hasStartCNAME(domain),
    checkAdminConsole(domain),
    getRegistrationYear(domain),
  ]);

  const partial = { domain, googleMX, legacyCNAME, startCNAME, adminConsole, registrationYear };
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

    const results = await Promise.all(batch.map(d => scanDomain(d)));
    const hits = results.filter(r => r.score >= HIT_THRESHOLD);

    // Merge hits into KV (deduplicate by domain)
    if (hits.length > 0) {
      const existing: ScanResult[] = (await kv.get('hits')) || [];
      const existingDomains = new Set(existing.map(h => h.domain));
      const newHits = hits.filter(h => !existingDomains.has(h.domain));
      const updated = [...newHits, ...existing].slice(0, 1000);
      await kv.set('hits', updated);

      if (newHits.length > 0) {
        await sendHitEmail(newHits).catch(err => console.error('Email error:', err));
      }
    }

    const newIndex = currentIndex + BATCH_SIZE;
    await Promise.all([
      kv.set('scan_index', newIndex >= domainList.length ? 0 : newIndex),
      kv.set('last_scan', {
        timestamp: new Date().toISOString(),
        scanned: batch.length,
        hitsFound: hits.length,
        batchStart: currentIndex,
      }),
    ]);

    return NextResponse.json({
      success: true,
      scanned: batch.length,
      hits: hits.length,
      nextIndex: newIndex >= domainList.length ? 0 : newIndex,
      totalDomains: domainList.length,
    });
  } catch (err: any) {
    console.error('Scan error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
