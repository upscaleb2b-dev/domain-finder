/**
 * Discovers pre-2012 domains via Archive.org CDX API.
 * Runs every 6 hours via Vercel cron.
 */
import { NextResponse } from 'next/server';
import { kv } from '@/lib/kv';

const CDX_BASE = 'https://web.archive.org/cdx/search/cdx';

// Patterns that prove Google Apps was active (avoid encoding * by building URL manually)
const CDX_PATTERNS = [
  'sites.google.com/a/*',
  'mail.google.com/a/*',
  'docs.google.com/a/*',
];

function extractDomain(rawUrl: string): string | null {
  const match = rawUrl.match(/\/a\/([a-z0-9][a-z0-9\-\.]{1,60}\.[a-z]{2,})/i);
  if (!match) return null;
  const d = match[1].toLowerCase();
  if (d.endsWith('.google.com') || d.endsWith('.googleapis.com')) return null;
  return d;
}

async function fetchCDX(pattern: string): Promise<string[]> {
  // Build URL manually so * stays literal (not %2A)
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
    const res = await fetch(`${CDX_BASE}?${params}`, {
      signal: AbortSignal.timeout(8000), // stay under Vercel's 10s limit
    });
    if (!res.ok) return [];
    const rows: string[][] = await res.json();
    if (!Array.isArray(rows) || rows.length < 2) return [];
    return rows.slice(1).map(r => extractDomain(r[0] || '')).filter((d): d is string => d !== null);
  } catch {
    return [];
  }
}

export async function GET() {
  const discovered: string[] = [];

  // Run CDX queries sequentially to avoid hammering the API
  for (const pattern of CDX_PATTERNS) {
    const domains = await fetchCDX(pattern);
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
    source: 'archive.org CDX',
  });

  return NextResponse.json({ success: true, discovered: newDomains.length, total: merged.length });
}
