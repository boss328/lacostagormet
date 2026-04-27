import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { ADMIN_COOKIE, expectedSessionToken } from '@/lib/admin/session';

/**
 * Route guards + Supabase session refresh.
 *
 * Two independent auth systems:
 *   /admin/*    — single shared password (ADMIN_PASSWORD env). HMAC-signed
 *                 cookie. NO Supabase involvement; the admin branch
 *                 short-circuits before any Supabase work runs.
 *   everything else — Supabase customer session. Middleware refreshes
 *                 the session on every request via supabase.auth.getUser()
 *                 so cookies don't go stale between navigations.
 *
 * The Supabase block uses the canonical @supabase/ssr v0.5+ pattern:
 *
 *   1. response = NextResponse.next({ request: req })
 *   2. createServerClient with getAll / setAll cookie callbacks
 *   3. setAll mutates req.cookies AND rebuilds response with the new
 *      request, then writes Set-Cookie on the response. This is the
 *      critical step — without the request mutation + rebuild, server
 *      components read stale cookies via cookies() and getUser() returns
 *      null on the very next request, which is exactly the "logs out
 *      on subsequent page navigation" symptom we're fixing here.
 *   4. await supabase.auth.getUser() — refreshes the access token if
 *      it's expired, persists the new pair via setAll.
 *
 * The /account/* gate runs AFTER the refresh: if there's still no user,
 * redirect to /login/. The redirect target inherits the response cookies
 * we just built so any refresh attempt is preserved (cookies that
 * Supabase wrote during getUser are passed forward even if we redirect).
 *
 * trailingSlash:true is set in next.config; every redirect target is
 * written WITH a trailing slash here to skip the 308 hop that previously
 * dropped cookies on Vercel.
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

  // ── Auth flow paths handle their own cookies — skip Supabase refresh ──
  // /auth/callback runs exchangeCodeForSession with its own cookie
  // wiring; /auth/signout actively clears cookies. Touching them here
  // would either race the callback's cookie writes or undo signout.
  if (pathname.startsWith('/auth/')) {
    return NextResponse.next();
  }

  // ── Customer-side Supabase session refresh ────────────────────────────
  // Canonical @supabase/ssr v0.5+ middleware pattern. See file comment.
  let response = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { flowType: 'pkce' },
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // 1. Mutate the request so downstream reads (server components
          //    calling cookies()) see the refreshed values.
          for (const { name, value } of cookiesToSet) {
            req.cookies.set(name, value);
          }
          // 2. Rebuild the response carrying the mutated request forward.
          response = NextResponse.next({ request: req });
          // 3. Attach Set-Cookie headers so the browser stores the new
          //    pair on this response trip.
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Refresh the session. This is the call that keeps customers signed in
  // across page navigations — without it the access token expires and
  // every subsequent page treats the user as logged out.
  const { data } = await supabase.auth.getUser();

  // ── /account/* gate ────────────────────────────────────────────────────
  if (pathname.startsWith('/account')) {
    if (!data.user) {
      const url = req.nextUrl.clone();
      url.pathname = '/login/';
      url.searchParams.set('redirect', pathname);
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  // Run on every request EXCEPT Next's static pipeline + image
  // optimisation + favicons + obvious static assets. Customer session
  // refresh has to happen on every page nav, not just /account hits;
  // narrow matchers are why customers were getting silently logged out.
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
