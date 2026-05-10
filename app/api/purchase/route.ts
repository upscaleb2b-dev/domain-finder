import { NextResponse } from 'next/server';
import { kv } from '@/lib/kv';
import { verifyDashboardPw } from '@/lib/auth';
import type { ScanResult } from '@/lib/score';

// POST /api/purchase?pw=... { domain, bought: true|false }
export async function POST(request: Request) {
  if (!verifyDashboardPw(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { domain, bought } = await request.json();
  if (!domain) return NextResponse.json({ error: 'Missing domain' }, { status: 400 });

  const hits: ScanResult[] = (await kv.get('hits')) || [];
  const updated = hits.map(h => h.domain === domain ? { ...h, bought: !!bought } : h);
  await kv.set('hits', updated);
  return NextResponse.json({ ok: true });
}
