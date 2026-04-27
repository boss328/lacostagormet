import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { ADMIN_COOKIE, expectedSessionToken } from '@/lib/admin/session';

/**
 * Two independent auth systems, both gated here:
 *
 *   /admin/*    — single shared password (ADMIN_PASSWORD env). HMAC-signed
 *                 lcg_admin_session cookie. NO Supabase. The admin branch
 *                 short-circuits before any Supabase work.
 *   everything else — Supabase customer session. Refreshed on EVERY request
 *                 by updateSession() so cookies don't go stale between
 *                 navigations. /account/* additionally redirects to /login
 *                 if no user.
 *
 * Refresh-on-every-request is non-negotiable: a narrow matcher was the
 * cause of the previous "signs in, then logs out on next click" bug. The
 * matcher below excludes Next's static + image pipelines and obvious
 * static asset extensions; everything else hits the middleware.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Admin gate (no Supabase) ──────────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    if (
      pathname === '/admin/login' ||
      pathname === '/admin/login/' ||
      pathname.startsWith('/api/admin/login') ||
      pathname.startsWith('/api/admin/logout')
    ) {
      return NextResponse.next();
    }

    const expected = await expectedSessionToken();
    if (!expected) {
      const url = req.nextUrl.clone();
      url.pathname = '/admin/login/';
      url.search = '?error=config';
      return NextResponse.redirect(url);
    }

    const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
    if (cookie !== expected) {
      const url = req.nextUrl.clone();
      url.pathname = '/admin/login/';
      url.searchParams.set('redirect', pathname);
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  }

  // ── Customer Supabase session refresh on every request ────────────────
  const { response, user } = await updateSession(req);

  // ── /account/* gate ───────────────────────────────────────────────────
  if (pathname.startsWith('/account')) {
    if (!user) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('redirect', pathname);
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  // Run on every request EXCEPT Next's static pipeline + image
  // optimisation + favicons + obvious static assets. Customer session
  // refresh has to happen on every page nav, not just /account hits.
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
