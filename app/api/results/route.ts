import { NextResponse } from 'next/server';
import { kv } from '@/lib/kv';
import { verifyDashboardPw } from '@/lib/auth';

export async function GET(request: Request) {
  if (!verifyDashboardPw(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [hits, lastScan, lastDiscover, domains, scanIndex] = await Promise.all([
    kv.get('hits'),
    kv.get('last_scan'),
    kv.get('last_discover'),
    kv.get<string[]>('domains'),
    kv.get<number>('scan_index'),
  ]);

  const total = (domains || []).length;
  const index = scanIndex || 0;

  return NextResponse.json({
    hits: hits || [],
    lastScan: lastScan || null,
    lastDiscover: lastDiscover || null,
    totalDomains: total,
    scanIndex: index,
    progress: total > 0 ? Math.round((index / total) * 100) : 0,
  });
}
