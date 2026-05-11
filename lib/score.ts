export interface ScanResult {
  domain: string;
  googleMX: boolean;
  legacyCNAME: boolean;
  startCNAME: boolean;
  adminConsole: boolean;
  spfGoogle: boolean;
  historicalGoogleSites: boolean;
  registrationYear: number | null;
  score: number;
  timestamp: string;
  bought: boolean;
}

// Scoring weights derived from observed success rates:
// start.* CNAME → ghs.google.com is the single strongest pre-2010 signal
// Admin console redirect proves the panel is still live
// Historical CDX evidence confirms Google Apps was actively configured
export function computeScore(r: Omit<ScanResult, 'score' | 'timestamp' | 'bought'>): number {
  let score = 0;
  if (r.startCNAME) score += 55;                              // Golden signal
  if (r.adminConsole) score += 45;                            // Panel confirmed live
  if (r.historicalGoogleSites) score += 35;                   // Archive evidence
  if (r.googleMX) score += 30;                                // Active Google mail
  if (r.legacyCNAME) score += 25;                            // Legacy CNAME on subdomain
  if (r.spfGoogle) score += 15;                               // SPF confirms Google mail provider
  if (r.registrationYear && r.registrationYear <= 2012) score += 15; // Pre-2012 age
  return Math.min(score, 100);
}
