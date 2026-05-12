import { NextResponse } from 'next/server';
import { kv } from '@/lib/kv';

const BLOCKED_SUFFIXES = [
  '.edu', '.gov', '.mil',
  '.edu.au', '.edu.tw', '.edu.cn', '.edu.hk', '.edu.sg', '.edu.my',
  '.edu.ph', '.edu.pk', '.edu.ng', '.edu.gh', '.edu.br', '.edu.mx',
  '.edu.ar', '.edu.co', '.edu.pe', '.edu.ec', '.edu.ve',
  '.ac.uk', '.sch.uk', '.ac.nz', '.ac.jp', '.ac.kr', '.ac.za',
  '.ac.in', '.ac.id', '.gov.uk', '.gov.au', '.gov.in', '.gov.cn',
];
const BLOCKED_PATTERNS = ['.k12.', '.edu.'];
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
