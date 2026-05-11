export interface ScanResult {
  domain: string;
  available: boolean;
  pendingDrop: boolean;
  mxRecords: boolean;
  cnameSignal: boolean;
  subCNAME: boolean;
  panelActive: boolean;
  spfRecord: boolean;
  registrationYear: number | null;
  score: number;
  timestamp: string;
  bought: boolean;
}

export function computeScore(r: Omit<ScanResult, 'score' | 'timestamp' | 'bought'>): number {
  let score = 0;
  if (r.subCNAME)   score += 55;
  if (r.panelActive) score += 45;
  if (r.mxRecords)  score += 35;
  if (r.cnameSignal) score += 30;
  if (r.spfRecord)  score += 20;
  if (r.registrationYear && r.registrationYear <= 2012) score += 15;
  return Math.min(score, 100);
}
