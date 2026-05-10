import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const formData = await request.formData();
  const pw = formData.get('password') as string;
  const expected = process.env.DASHBOARD_PASSWORD;

  if (!expected || pw !== expected) {
    return NextResponse.redirect(new URL('/login?error=1', request.url));
  }

  const response = NextResponse.redirect(new URL('/', request.url));
  response.cookies.set('lgf_auth', pw, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });
  return response;
}
