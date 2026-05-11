import { NextResponse } from 'next/server';
import { kv } from '@/lib/kv';

const BLOCKED_SUFFIXES = ['.edu', '.gov', '.mil', '.ac.uk', '.sch.uk'];
const BLOCKED_PATTERNS = ['.k12.'];
function isBlocked(d: string): boolean {
  return BLOCKED_SUFFIXES.some(s => d.endsWith(s)) || BLOCKED_PATTERNS.some(p => d.includes(p));
}

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

  const cleanHits = ((hits as any[]) || []).filter((h: any) => !isBlocked(h.domain));

  return NextResponse.json({
    hits: cleanHits,
    lastScan: lastScan || null,
    lastDiscover: lastDiscover || null,
    scanLog: scanLog || [],
    totalDomains: total,
    scanIndex: index,
    progress: total > 0 ? Math.round((index / total) * 100) : 0,
    totalScanned: totalScanned || 0,
  });
}
