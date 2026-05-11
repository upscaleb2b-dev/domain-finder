/**
 * Discovers pre-2012 domains via Archive.org CDX and CommonCrawl CDX APIs.
 * Runs every 6 hours via Vercel cron / GitHub Actions.
 */
import { NextResponse } from 'next/server';
import { kv } from '@/lib/kv';

const WAYBACK_CDX = 'https://web.archive.org/cdx/search/cdx';
const CC_CDX = 'https://index.commoncrawl.org/CC-MAIN-2012-20-index'; // ~2012 crawl

// All Google Apps /a/ paths that prove legacy free tier was active
const CDX_PATTERNS = [
  'sites.google.com/a/*',
  'mail.google.com/a/*',
  'docs.google.com/a/*',
  'calendar.google.com/a/*',
  'drive.google.com/a/*',
  'contacts.google.com/a/*',
];

function extractDomain(rawUrl: string): string | null {
  const match = rawUrl.match(/\/a\/([a-z0-9][a-z0-9\-\.]{1,60}\.[a-z]{2,})/i);
  if (!match) return null;
  const d = match[1].toLowerCase();
  if (d.endsWith('.google.com') || d.endsWith('.googleapis.com')) return null;
  return d;
}

async function fetchWayback(pattern: string): Promise<string[]> {
  const params = [
    `url=${pattern}`,
    'output=json',
    'fl=original',
    'from=20060101',
    'to=20121231',
    'limit=500',
    'collapse=urlkey',
  ].join('&');
  try {
    const res = await fetch(`${WAYBACK_CDX}?${params}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const rows: string[][] = await res.json();
    if (!Array.isArray(rows) || rows.length < 2) return [];
    return rows.slice(1).map(r => extractDomain(r[0] || '')).filter((d): d is string => d !== null);
  } catch {
    return [];
  }
}

async function fetchCommonCrawl(pattern: string): Promise<string[]> {
  const params = [
    `url=${pattern}`,
    'output=json',
    'fl=url',
    'limit=500',
    'collapse=urlkey',
  ].join('&');
  try {
    const res = await fetch(`${CC_CDX}?${params}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    // CommonCrawl returns newline-delimited JSON objects
    const text = await res.text();
    return text
      .split('\n')
      .filter(Boolean)
      .map(line => {
        try { return extractDomain(JSON.parse(line).url || ''); } catch { return null; }
      })
      .filter((d): d is string => d !== null);
  } catch {
    return [];
  }
}

export async function GET() {
  const discovered: string[] = [];

  // Wayback CDX — primary source, 6 patterns
  for (const pattern of CDX_PATTERNS) {
    const domains = await fetchWayback(pattern);
    discovered.push(...domains);
  }

  // CommonCrawl — different dataset, catches domains Wayback missed
  for (const pattern of CDX_PATTERNS.slice(0, 3)) { // top 3 patterns only to stay under timeout
    const domains = await fetchCommonCrawl(pattern);
    discovered.push(...domains);
  }

  const unique = [...new Set(discovered)];
  const existing: string[] = (await kv.get('domains')) || [];
  const existingSet = new Set(existing);
  const newDomains = unique.filter(d => !existingSet.has(d));
  const merged = [...existing, ...newDomains];

  if (newDomains.length > 0) {
    await kv.set('domains', merged);
  }

  await kv.set('last_discover', {
    timestamp: new Date().toISOString(),
    discovered: newDomains.length,
    total: merged.length,
    sources: ['archive.org CDX (6 patterns)', 'CommonCrawl CDX (3 patterns)'],
  });

  return NextResponse.json({
    success: true,
    discovered: newDomains.length,
    total: merged.length,
  });
}
