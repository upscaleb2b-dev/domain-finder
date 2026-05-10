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

// ghs.google.com = legacy free; ghs.googlehosted.com = paid Workspace
const LEGACY_TARGETS = ['ghs.google.com'];
const ALL_GOOGLE_CNAME = ['ghs.google.com', 'ghs.googlehosted.com'];

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

// start.domain.com → ghs.google.com is the strongest pre-2010 signal
export async function hasStartCNAME(domain: string): Promise<boolean> {
  const answers = await queryDNS(`start.${domain}`, 'CNAME');
  return answers.some((a: any) =>
    ALL_GOOGLE_CNAME.some(p => String(a.data || '').toLowerCase().includes(p))
  );
}

export async function checkAdminConsole(domain: string): Promise<boolean> {
  try {
    const res = await fetch(`https://admin.google.com/${domain}`, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(6000),
    });
    const location = res.headers.get('location') || '';
    return res.status >= 300 && res.status < 400 && location.includes('accounts.google.com');
  } catch {
    return false;
  }
}
