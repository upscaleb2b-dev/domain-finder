import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE = 'lgf_auth';

export function proxy(request: NextRequest) {
  const pw = process.env.DASHBOARD_PASSWORD;

  // No password set → open access
  if (!pw) return NextResponse.next();

  const { pathname } = request.nextUrl;

  // Always allow the login page and auth endpoint through
  if (pathname === '/login' || pathname === '/api/auth') {
    return NextResponse.next();
  }

  // Cron endpoints use CRON_SECRET header, not cookie
  if (pathname === '/api/scan' || pathname === '/api/discover') {
    return NextResponse.next();
  }

  // Everything else: check cookie
  const cookie = request.cookies.get(COOKIE);
  if (cookie?.value === pw) return NextResponse.next();

  // API calls get 401
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Pages get redirected to login
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
