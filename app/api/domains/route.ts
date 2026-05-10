import { NextResponse } from 'next/server';
import { kv } from '@/lib/kv';

export async function GET() {
  const domains: string[] = (await kv.get('domains')) || [];
  return NextResponse.json({ count: domains.length, domains });
}

export async function POST(request: Request) {
  const body = await request.json();
  const incoming: string[] = (body.domains || [])
    .map((d: string) => d.trim().toLowerCase())
    .filter((d: string) => d && d.includes('.'));

  const existing: string[] = (await kv.get('domains')) || [];
  const merged = [...new Set([...existing, ...incoming])];
  await kv.set('domains', merged);
  return NextResponse.json({ added: merged.length - existing.length, total: merged.length });
}

export async function DELETE() {
  await Promise.all([kv.set('domains', []), kv.set('scan_index', 0)]);
  return NextResponse.json({ message: 'Queue cleared' });
}
