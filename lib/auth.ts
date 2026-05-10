export function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = request.headers.get('authorization') || '';
  return auth === `Bearer ${secret}`;
}

export function verifyDashboardPw(request: Request): boolean {
  const pw = process.env.DASHBOARD_PASSWORD;
  if (!pw) return true;
  const provided = new URL(request.url).searchParams.get('pw') || '';
  return provided === pw;
}
