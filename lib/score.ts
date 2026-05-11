export interface ScanResult {
  domain: string;
  available: boolean;
  pendingDrop: boolean;
  googleMX: boolean;
  legacyCNAME: boolean;
  startCNAME: boolean;
  adminConsole: boolean;
  spfGoogle: boolean;
  registrationYear: number | null;
  score: number;
  timestamp: string;
  bought: boolean;
}

export function computeScore(r: Omit<ScanResult, 'score' | 'timestamp' | 'bought'>): number {
  let score = 0;
  if (r.startCNAME) score += 55;
  if (r.adminConsole) score += 45;
  if (r.googleMX) score += 35;
  if (r.legacyCNAME) score += 30;
  if (r.spfGoogle) score += 20;
  if (r.registrationYear && r.registrationYear <= 2012) score += 15;
  return Math.min(score, 100);
}
