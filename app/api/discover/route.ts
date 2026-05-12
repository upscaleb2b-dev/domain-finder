/**
 * Populates the domain queue via CDX index queries and certificate transparency logs.
 * Runs every 2 hours via GitHub Actions.
 */
import { NextResponse } from 'next/server';
import { kv } from '@/lib/kv';

const WAYBACK_CDX = 'https://web.archive.org/cdx/search/cdx';

const CC_INDEXES = [
  'https://index.commoncrawl.org/CC-MAIN-2008-2009-index',
  'https://index.commoncrawl.org/CC-MAIN-2009-2010-index',
  'https://index.commoncrawl.org/CC-MAIN-2012-20-index',
  'https://index.commoncrawl.org/CC-MAIN-2013-48-index',
  'https://index.commoncrawl.org/CC-MAIN-2014-52-index',
];

const CDX_PATTERNS = [
  'sites.google.com/a/*',
  'mail.google.com/a/*',
  'docs.google.com/a/*',
  'calendar.google.com/a/*',
  'drive.google.com/a/*',
  'contacts.google.com/a/*',
  'groups.google.com/a/*',
  'video.google.com/a/*',
  'admin.google.com/a/*',
  'spreadsheets.google.com/a/*',
];

const SKIP_TLDS = [
  '.edu', '.gov', '.mil',
  '.edu.au', '.edu.tw', '.edu.cn', '.edu.hk', '.edu.sg', '.edu.my',
  '.edu.ph', '.edu.pk', '.edu.ng', '.edu.gh', '.edu.br', '.edu.mx',
  '.edu.ar', '.edu.co', '.edu.pe', '.edu.ec', '.edu.ve',
  '.ac.uk', '.sch.uk', '.ac.nz', '.ac.jp', '.ac.kr', '.ac.za',
  '.ac.in', '.ac.id', '.gov.uk', '.gov.au', '.gov.in', '.gov.cn',
];

function extractDomain(rawUrl: string): string | null {
  const match = rawUrl.match(/\/a\/([a-z0-9][a-z0-9\-\.]{1,60}\.[a-z]{2,})/i);
  if (!match) return null;
  const d = match[1].toLowerCase();
  if (d.endsWith('.google.com') || d.endsWith('.googleapis.com')) return null;
  if (SKIP_TLDS.some(tld => d.endsWith(tld)) || d.includes('.edu.') || d.includes('.k12.')) return null;
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

// Subdomains indicating Google Apps usage — used for crt.sh queries
const CRTSH_SUBS = ['mail', 'sites', 'docs', 'calendar', 'drive'];

async function fetchCrtSh(subdomain: string): Promise<string[]> {
  const q = encodeURIComponent(`${subdomain}.%`);
  try {
    const res = await fetch(`https://crt.sh/?q=${q}&output=json`, {
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return [];
    const data: any[] = await res.json();
    const results: string[] = [];
    const prefix = `${subdomain}.`;
    for (const cert of data) {
      // Only Google-issued certs from the legacy era
      const issuer = String(cert.issuer_name || '').toLowerCase();
      if (!issuer.includes('google')) continue;
      const notBefore = new Date(cert.not_before || '');
      if (isNaN(notBefore.getTime())) continue;
      const year = notBefore.getFullYear();
      if (year < 2006 || year > 2013) continue;
      // name_value can contain multiple SANs separated by newlines
      const names = String(cert.name_value || cert.common_name || '')
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);
      for (const name of names) {
        if (!name.startsWith(prefix)) continue;
        const base = name.slice(prefix.length);
        const d = extractDomain(`/a/${base}`);
        if (d) results.push(d);
      }
    }
    return results;
  } catch {
    return [];
  }
}

export async function GET() {
  const waybackPromises = CDX_PATTERNS.map(p => fetchWayback(p));
  const ccPromises = CC_INDEXES.flatMap(idx =>
    CDX_PATTERNS.slice(0, 4).map(p => fetchCommonCrawl(idx, p))
  );
  const crtShPromises = CRTSH_SUBS.map(s => fetchCrtSh(s));

  const allResults = await Promise.all([...waybackPromises, ...ccPromises, ...crtShPromises]);
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
