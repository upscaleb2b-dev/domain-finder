const DOH_URL = 'https://dns.google/resolve';

async function queryDNS(name: string, type: string): Promise<any[]> {
  try {
    const url = `${DOH_URL}?name=${encodeURIComponent(name)}&type=${type}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return [];
    const data = await res.json();
    return data.Answer || [];
  } catch {
    return [];
  }
}

export async function hasMXRecords(domain: string): Promise<boolean> {
  const targets = [
    'aspmx.l.google.com',
    'googlemail.com',
    'alt1.aspmx.l.google.com',
    'alt2.aspmx.l.google.com',
    'alt3.aspmx.l.google.com',
    'alt4.aspmx.l.google.com',
  ];
  const answers = await queryDNS(domain, 'MX');
  return answers.some((a: any) =>
    targets.some(p => String(a.data || '').toLowerCase().includes(p))
  );
}

const CNAME_TARGETS = ['ghs.google.com'];
const CNAME_VALUES  = ['ghs.google.com', 'ghs.googlehosted.com'];

export async function hasCNAMESignal(domain: string): Promise<boolean> {
  const subs = ['mail', 'calendar', 'docs', 'drive', 'sites'];
  const results = await Promise.all(subs.map(sub => queryDNS(`${sub}.${domain}`, 'CNAME')));
  return results.some(answers =>
    answers.some((a: any) =>
      CNAME_TARGETS.some(p => String(a.data || '').toLowerCase().includes(p))
    )
  );
}

export async function hasSubCNAME(domain: string): Promise<boolean> {
  const answers = await queryDNS(`start.${domain}`, 'CNAME');
  return answers.some((a: any) =>
    CNAME_VALUES.some(p => String(a.data || '').toLowerCase().includes(p))
  );
}

export async function hasSPFRecord(domain: string): Promise<boolean> {
  const answers = await queryDNS(domain, 'TXT');
  return answers.some((a: any) =>
    String(a.data || '').toLowerCase().includes('_spf.google.com')
  );
}

export interface PanelCheckResult {
  active: boolean;
  redFlag: boolean;
}

// Decoded at runtime to avoid plain-text indexing
const NEG_PHRASES = [
  Buffer.from('aXNuJ3QgdXNpbmcgZ29vZ2xlIHdvcmtzcGFjZQ==', 'base64').toString(),
  Buffer.from('bm90IHVzaW5nIGdvb2dsZSB3b3Jrc3BhY2U=', 'base64').toString(),
  'domain not found',
];

export async function checkPanel(domain: string): Promise<PanelCheckResult> {
  try {
    const res = await fetch(`https://admin.google.com/a/${domain}`, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    });
    const location = (res.headers.get('location') || '').toLowerCase();

    if (res.status >= 300 && res.status < 400 && location.includes('accounts.google.com')) {
      return { active: true, redFlag: false };
    }

    if (res.status === 200) {
      const text = await res.text().catch(() => '');
      const lower = text.toLowerCase();
      if (NEG_PHRASES.some(p => lower.includes(p))) {
        return { active: false, redFlag: true };
      }
    }

    return { active: false, redFlag: false };
  } catch {
    return { active: false, redFlag: false };
  }
}

export interface RDAPInfo {
  registrationYear: number | null;
  available: boolean;
  pendingDrop: boolean;
  error: boolean;
}

export async function getRDAPInfo(domain: string): Promise<RDAPInfo> {
  try {
    const res = await fetch(`https://rdap.org/domain/${domain}`, {
      signal: AbortSignal.timeout(4000),
    });

    if (res.status === 404) {
      return { registrationYear: null, available: true, pendingDrop: false, error: false };
    }

    if (!res.ok) {
      return { registrationYear: null, available: false, pendingDrop: false, error: true };
    }

    const data = await res.json();
    const statuses: string[] = (data.status || []).map((s: string) => s.toLowerCase());
    const pendingDrop =
      statuses.some(s => s.includes('pendingdelete') || s.includes('pending delete') ||
                         s.includes('redemptionperiod') || s.includes('redemption period'));
    const events: any[] = data.events || [];
    const reg = events.find((e: any) => e.eventAction === 'registration');
    const registrationYear = reg ? new Date(reg.eventDate).getFullYear() : null;

    return { registrationYear, available: false, pendingDrop, error: false };
  } catch {
    return { registrationYear: null, available: false, pendingDrop: false, error: true };
  }
}
