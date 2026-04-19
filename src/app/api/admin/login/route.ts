import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_COOKIE = 'lcg_admin';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const password = String(form.get('password') ?? '');
  const redirect = String(form.get('redirect') ?? '/admin');
  const expected = process.env.ADMIN_PASSWORD;

  const url = new URL(req.url);

  if (!expected) {
    console.error('[admin/login] ADMIN_PASSWORD env var not configured');
    return NextResponse.redirect(new URL('/admin/login?error=config', url.origin), 303);
  }

  if (password !== expected) {
    return NextResponse.redirect(
      new URL(`/admin/login?error=wrong&redirect=${encodeURIComponent(redirect)}`, url.origin),
      303,
    );
  }

  const res = NextResponse.redirect(new URL(redirect, url.origin), 303);
  res.cookies.set({
    name: ADMIN_COOKIE,
    value: expected,
    maxAge: COOKIE_MAX_AGE,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  return res;
}
