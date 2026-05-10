/**
 * Auto-discovers pre-2012 domains via Archive.org CDX API.
 * Looks for domains that had active Google Apps pages in the 2006-2012 era.
 * Runs every 6 hours via Vercel cron.
 */
import { NextResponse } from 'next/server';
import { kv } from '@/lib/kv';
import { verifyCronSecret } from '@/lib/auth';

const CDX_BASE = 'https://web.archive.org/cdx/search/cdx';

// Queries that prove Google Apps was active on that domain
const CDX_QUERIES = [
  { url: 'sites.google.com/a/*', label: 'Google Sites /a/ path' },
  { url: 'mail.google.com/a/*', label: 'Google Mail /a/ path' },
  { url: 'docs.google.com/a/*', label: 'Google Docs /a/ path' },
];

const YEAR_RANGE = { from: '20060101', to: '20121231' };

function extractDomainFromUrl(rawUrl: string): string | null {
  try {
    // CDX urls look like: sites.google.com/a/DOMAIN/...
    const match = rawUrl.match(/\/a\/([a-z0-9][a-z0-9\-\.]+\.[a-z]{2,})/i);
    if (!match) return null;
    const domain = match[1].toLowerCase();
    if (!domain.includes('.') || domain.endsWith('.google.com')) return null;
    return domain;
  } catch {
    return null;
  }
}

async function fetchCDXDomains(urlPattern: string): Promise<string[]> {
  const params = new URLSearchParams({
    url: urlPattern,
    output: 'json',
    fl: 'original',
    from: YEAR_RANGE.from,
    to: YEAR_RANGE.to,
    limit: '5000',
    collapse: 'urlkey',
    filter: 'statuscode:200',
  });

  const res = await fetch(`${CDX_BASE}?${params}`, {
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) return [];

  const rows: string[][] = await res.json();
  if (!Array.isArray(rows) || rows.length < 2) return [];

  // Skip header row
  return rows
    .slice(1)
    .map(row => extractDomainFromUrl(row[0] || ''))
    .filter((d): d is string => d !== null);
}

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const discovered: string[] = [];

    for (const query of CDX_QUERIES) {
      const domains = await fetchCDXDomains(query.url);
      discovered.push(...domains);
    }

    const unique = [...new Set(discovered)];

    // Merge into KV queue (avoid duplicates)
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

    return NextResponse.json({
      success: true,
      discovered: newDomains.length,
      total: merged.length,
    });
  } catch (err: any) {
    console.error('Discover error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
