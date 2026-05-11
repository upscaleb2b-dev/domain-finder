import { NextResponse } from 'next/server';
import { kv } from '@/lib/kv';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'clear-hits') {
    await Promise.all([
      kv.set('hits', []),
      kv.set('scan_log', []),
    ]);
    return NextResponse.json({ ok: true, action: 'cleared hits and scan log' });
  }

  if (action === 'reset-index') {
    await kv.set('scan_index', 0);
    return NextResponse.json({ ok: true, action: 'scan index reset to 0' });
  }

  if (action === 'clear-all') {
    await Promise.all([
      kv.set('hits', []),
      kv.set('scan_log', []),
      kv.set('domains', []),
      kv.set('scan_index', 0),
    ]);
    return NextResponse.json({ ok: true, action: 'cleared everything' });
  }

  const [hits, domains, scanIndex] = await Promise.all([
    kv.get<any[]>('hits'),
    kv.get<string[]>('domains'),
    kv.get<number>('scan_index'),
  ]);

  return NextResponse.json({
    hits: (hits || []).length,
    domains: (domains || []).length,
    scanIndex: scanIndex || 0,
    actions: ['clear-hits', 'reset-index', 'clear-all'],
  });
}
