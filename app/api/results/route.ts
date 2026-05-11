import { NextResponse } from 'next/server';
import { kv } from '@/lib/kv';

export async function GET() {
  const [hits, lastScan, lastDiscover, domains, scanIndex, scanLog, totalScanned] = await Promise.all([
    kv.get('hits'),
    kv.get('last_scan'),
    kv.get('last_discover'),
    kv.get<string[]>('domains'),
    kv.get<number>('scan_index'),
    kv.get('scan_log'),
    kv.get<number>('total_scanned'),
  ]);

  const total = (domains || []).length;
  const index = scanIndex || 0;

  return NextResponse.json({
    hits: hits || [],
    lastScan: lastScan || null,
    lastDiscover: lastDiscover || null,
    scanLog: scanLog || [],
    totalDomains: total,
    scanIndex: index,
    progress: total > 0 ? Math.round((index / total) * 100) : 0,
    totalScanned: totalScanned || 0,
  });
}
