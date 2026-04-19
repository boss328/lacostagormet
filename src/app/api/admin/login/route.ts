import { NextResponse, type NextRequest } from 'next/server';
import {
  ADMIN_COOKIE,
  REMEMBER_MAX_AGE,
  computeAdminCookieToken,
} from '@/lib/admin/auth-cookie';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin login handler.
 *
 * Every URL we redirect to here is written WITH a trailing slash so
 * Vercel's edge layer doesn't need to issue a 308 (we run with
 * `trailingSlash: true` in next.config.mjs). Each 308 in a POST chain
 * is a chance for the body or the Set-Cookie response to drop on
 * Vercel's edge — that was the source of the previous redirect loop.
 *
 * Cookie value is sha256(password + password) — see auth-cookie.ts for why.
 *
 * Cookie flags:
 *   • httpOnly  — yes, no JS should read this
 *   • sameSite  — 'lax', allows top-level navigations from external links
 *                 to carry the cookie; blocks CSRF-style cross-site POSTs
 *   • path      — '/', cookie is sent on every admin route
 *   • secure    — NOT set, by design. Vercel always serves over HTTPS, so
 *                 dropping the flag changes nothing in practice; it removes
 *                 the only setting that depended on Vercel's edge correctly
 *                 reporting the request scheme to the Node runtime.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const password = String(form.get('password') ?? '');
  // Default redirect carries trailing slash to match trailingSlash:true.
  const redirect = String(form.get('redirect') ?? '/admin/');
  const remember = String(form.get('remember') ?? '') === 'true';
  const expected = process.env.ADMIN_PASSWORD;

  const url = new URL(req.url);

  if (!expected) {
    console.error('[admin/login] ADMIN_PASSWORD env var not configured');
    return NextResponse.redirect(new URL('/admin/login/?error=config', url.origin), 303);
  }

  if (password !== expected) {
    return NextResponse.redirect(
      new URL(`/admin/login/?error=wrong&redirect=${encodeURIComponent(redirect)}`, url.origin),
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
    sameSite: 'lax',
    path: '/',
  });
  return res;
}
