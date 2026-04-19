import { NextResponse, type NextRequest } from 'next/server';
import {
  ADMIN_COOKIE,
  REMEMBER_MAX_AGE,
  computeAdminCookieToken,
} from '@/lib/admin/auth-cookie';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const password = String(form.get('password') ?? '');
  const redirect = String(form.get('redirect') ?? '/admin');
  const remember = String(form.get('remember') ?? '') === 'true';
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

  const token = await computeAdminCookieToken(expected);
  const res = NextResponse.redirect(new URL(redirect, url.origin), 303);

  // Persistent vs session cookie: when "Remember this device" is checked
  // (the default), set a 90-day Max-Age so the user stays signed in
  // across browser restarts. When unchecked, omit Max-Age entirely so
  // the cookie clears the moment the browser closes.
  res.cookies.set({
    name: ADMIN_COOKIE,
    value: token,
    ...(remember ? { maxAge: REMEMBER_MAX_AGE } : {}),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  return res;
}
