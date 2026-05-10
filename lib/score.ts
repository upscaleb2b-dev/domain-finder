export interface ScanResult {
  domain: string;
  googleMX: boolean;
  legacyCNAME: boolean;
  startCNAME: boolean;
  adminConsole: boolean;
  registrationYear: number | null;
  score: number;
  timestamp: string;
}

export function computeScore(r: Omit<ScanResult, 'score' | 'timestamp'>): number {
  let score = 0;
  if (r.googleMX) score += 30;
  if (r.legacyCNAME) score += 30;
  if (r.startCNAME) score += 25;   // strongest pre-2010 indicator
  if (r.adminConsole) score += 10;
  if (r.registrationYear && r.registrationYear <= 2010) score += 5;
  return Math.min(score, 100);
}
