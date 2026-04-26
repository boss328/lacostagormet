import { NextResponse, type NextRequest } from 'next/server';
import {
  ADMIN_COOKIE,
  ADMIN_COOKIE_MAX_AGE,
  computeSessionToken,
} from '@/lib/admin/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/login/  (trailing slash matches trailingSlash:true)
 *
 * Body (form-encoded):
 *   password — the shared admin password (must match ADMIN_PASSWORD env)
 *   redirect — optional admin path to land on after sign-in
 *
 * On success: 303 to {redirect or /admin/} with the lcg_admin_session
 * cookie set to HMAC-SHA256(password, ADMIN_SESSION_SECRET).
 *
 * Cookie flags:
 *   • httpOnly  — JS can't read the token
 *   • sameSite  — 'lax', survives top-level navigations from the form POST
 *   • path      — '/', sent on every admin route + every /api/admin call
 *   • secure    — NOT set, by design. Browser auto-decides based on the
 *                 connection scheme. The previous attempt's `secure: true`
 *                 dropped cookies whenever Vercel's edge mis-reported the
 *                 request scheme to the Node runtime.
 *   • maxAge    — 7 days (ADMIN_COOKIE_MAX_AGE)
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const password = String(form.get('password') ?? '');
  const redirect = String(form.get('redirect') ?? '/admin/');
  const expected = process.env.ADMIN_PASSWORD;

  const url = new URL(req.url);

  if (!expected) {
    return NextResponse.redirect(
      new URL('/admin/login/?error=config', url.origin),
      303,
    );
  }

  if (password !== expected) {
    return NextResponse.redirect(
      new URL(
        `/admin/login/?error=wrong&redirect=${encodeURIComponent(redirect)}`,
        url.origin,
      ),
      303,
    );
  }

  // Anchor the redirect to /admin/ — never honour a redirect target that
  // tries to bounce the user out of the admin surface (open-redirect guard).
  const safeRedirect = redirect.startsWith('/admin') ? redirect : '/admin/';

  const token = await computeSessionToken(expected);
  const res = NextResponse.redirect(new URL(safeRedirect, url.origin), 303);
  res.cookies.set({
    name: ADMIN_COOKIE,
    value: token,
    maxAge: ADMIN_COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
  return res;
}
