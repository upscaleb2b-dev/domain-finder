import { NextResponse } from 'next/server';
import { kv } from '@/lib/kv';
import { verifyDashboardPw } from '@/lib/auth';

export async function GET(request: Request) {
  if (!verifyDashboardPw(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const domains: string[] = (await kv.get('domains')) || [];
  return NextResponse.json({ count: domains.length, domains });
}

export async function POST(request: Request) {
  if (!verifyDashboardPw(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await request.json();
  const incoming: string[] = (body.domains || [])
    .map((d: string) => d.trim().toLowerCase())
    .filter((d: string) => d && d.includes('.'));

  const existing: string[] = (await kv.get('domains')) || [];
  const merged = [...new Set([...existing, ...incoming])];
  await kv.set('domains', merged);
  return NextResponse.json({ added: merged.length - existing.length, total: merged.length });
}

export async function DELETE(request: Request) {
  if (!verifyDashboardPw(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await Promise.all([kv.set('domains', []), kv.set('scan_index', 0)]);
  return NextResponse.json({ message: 'Queue cleared' });
}
