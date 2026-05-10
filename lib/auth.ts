// Dashboard auth is handled by middleware (cookie check).
// This only guards cron endpoints which don't go through the cookie flow.
export function verifyCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = request.headers.get('authorization') || '';
  return auth === `Bearer ${secret}`;
}
