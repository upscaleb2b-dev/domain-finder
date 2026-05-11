/**
 * Populates the domain queue via CDX index queries.
 * Runs every 6 hours via GitHub Actions.
 */
import { NextResponse } from 'next/server';
import { kv } from '@/lib/kv';

const WAYBACK_CDX = 'https://web.archive.org/cdx/search/cdx';

const CC_INDEXES = [
  'https://index.commoncrawl.org/CC-MAIN-2008-2009-index',
  'https://index.commoncrawl.org/CC-MAIN-2009-2010-index',
  'https://index.commoncrawl.org/CC-MAIN-2012-20-index',
];

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
    'limit=5000',
    'collapse=urlkey',
  ].join('&');
  try {
    const res = await fetch(`${WAYBACK_CDX}?${params}`, {
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return [];
    const rows: string[][] = await res.json();
    if (!Array.isArray(rows) || rows.length < 2) return [];
    return rows.slice(1).map(r => extractDomain(r[0] || '')).filter((d): d is string => d !== null);
  } catch {
    return [];
  }
}

async function fetchCommonCrawl(indexUrl: string, pattern: string): Promise<string[]> {
  const params = [
    `url=${pattern}`,
    'output=json',
    'fl=url',
    'limit=5000',
    'collapse=urlkey',
  ].join('&');
  try {
    const res = await fetch(`${indexUrl}?${params}`, {
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return [];
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
  const waybackPromises = CDX_PATTERNS.map(p => fetchWayback(p));
  const ccPromises = CC_INDEXES.flatMap(idx =>
    CDX_PATTERNS.slice(0, 3).map(p => fetchCommonCrawl(idx, p))
  );

  const allResults = await Promise.all([...waybackPromises, ...ccPromises]);
  const discovered = allResults.flat();

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
  });

  return NextResponse.json({
    success: true,
    discovered: newDomains.length,
    total: merged.length,
  });
}
