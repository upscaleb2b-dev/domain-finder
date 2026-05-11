const DOH_URL = 'https://dns.google/resolve';

async function queryDNS(name: string, type: string): Promise<any[]> {
  try {
    const url = `${DOH_URL}?name=${encodeURIComponent(name)}&type=${type}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = await res.json();
    return data.Answer || [];
  } catch {
    return [];
  }
}

export async function hasGoogleMX(domain: string): Promise<boolean> {
  const patterns = [
    'aspmx.l.google.com',
    'googlemail.com',
    'alt1.aspmx.l.google.com',
    'alt2.aspmx.l.google.com',
    'alt3.aspmx.l.google.com',
    'alt4.aspmx.l.google.com',
  ];
  const answers = await queryDNS(domain, 'MX');
  return answers.some((a: any) =>
    patterns.some(p => String(a.data || '').toLowerCase().includes(p))
  );
}

// ghs.google.com = legacy free tier; ghs.googlehosted.com = paid Workspace
const LEGACY_TARGETS = ['ghs.google.com'];
const ALL_GOOGLE_CNAME = ['ghs.google.com', 'ghs.googlehosted.com'];

// Checks mail/calendar/docs/drive/sites subdomains for legacy CNAME
export async function hasLegacyCNAME(domain: string): Promise<boolean> {
  const subs = ['mail', 'calendar', 'docs', 'drive', 'sites'];
  for (const sub of subs) {
    const answers = await queryDNS(`${sub}.${domain}`, 'CNAME');
    if (answers.some((a: any) =>
      LEGACY_TARGETS.some(p => String(a.data || '').toLowerCase().includes(p))
    )) return true;
  }
  return false;
}

// start.domain.com → ghs.google.com is the single strongest pre-2010 signal
export async function hasStartCNAME(domain: string): Promise<boolean> {
  const answers = await queryDNS(`start.${domain}`, 'CNAME');
  return answers.some((a: any) =>
    ALL_GOOGLE_CNAME.some(p => String(a.data || '').toLowerCase().includes(p))
  );
}

// SPF record including _spf.google.com proves Google was the mail provider
export async function hasSpfGoogle(domain: string): Promise<boolean> {
  const answers = await queryDNS(domain, 'TXT');
  return answers.some((a: any) =>
    String(a.data || '').toLowerCase().includes('_spf.google.com')
  );
}

// Query Wayback CDX to confirm Google Sites pages existed for this domain 2006-2012
export async function hasHistoricalGoogleSites(domain: string): Promise<boolean> {
  try {
    const params = [
      `url=sites.google.com/a/${domain}/*`,
      'output=json',
      'fl=statuscode',
      'from=20060101',
      'to=20121231',
      'limit=1',
      'filter=statuscode:200',
    ].join('&');
    const res = await fetch(`https://web.archive.org/cdx/search/cdx?${params}`, {
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return false;
    const rows: string[][] = await res.json();
    return Array.isArray(rows) && rows.length >= 2;
  } catch {
    return false;
  }
}

export interface AdminConsoleResult {
  active: boolean;  // redirects to accounts.google.com — panel exists
  redFlag: boolean; // explicitly says "not using Google Workspace"
}

export async function checkAdminConsole(domain: string): Promise<AdminConsoleResult> {
  try {
    // First try HEAD for the redirect check
    const res = await fetch(`https://admin.google.com/a/${domain}`, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(7000),
    });
    const location = (res.headers.get('location') || '').toLowerCase();

    if (res.status >= 300 && res.status < 400 && location.includes('accounts.google.com')) {
      return { active: true, redFlag: false };
    }

    // Check response body for the explicit rejection message
    if (res.status === 200) {
      const text = await res.text().catch(() => '');
      if (text.toLowerCase().includes("isn't using google workspace") ||
          text.toLowerCase().includes('not using google workspace') ||
          text.toLowerCase().includes('domain not found')) {
        return { active: false, redFlag: true };
      }
    }

    return { active: false, redFlag: false };
  } catch {
    return { active: false, redFlag: false };
  }
}
