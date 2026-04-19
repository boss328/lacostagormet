import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
// RESTORE-START — uncomment when re-enabling the admin gate below
// import { ADMIN_COOKIE, computeAdminCookieToken } from '@/lib/admin/auth-cookie';
// RESTORE-END

/**
 * Route guards:
 *   /account/* — requires a Supabase auth session (magic-link customer login)
 *   /admin/*   — requires an admin password cookie (Phase 6 gate, Phase 7
 *                replaces this with a real admin role)
 *
 * The admin-login page + the /api/admin/login route are publicly reachable
 * so the gate itself isn't locked behind the gate.
 *
 * EVERY URL we redirect to is written WITH a trailing slash to match
 * `trailingSlash: true` in next.config.mjs. Each 308 dance in the admin
 * login flow was a chance for cookies / POST bodies to drop on Vercel's
 * edge, which produced the previous redirect loop.
 *
 * Cookie comparison accepts both the new sha256 hash AND the legacy
 * plain-password value — back-compat for sessions established before the
 * hash rollout. See src/lib/admin/auth-cookie.ts for why we hash.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ╔══════════════════════════════════════════════════════════════════╗
  // ║ TEMP STAGING SHORTCUT — RESTORE BEFORE PROD LAUNCH               ║
  // ║                                                                  ║
  // ║ The admin gate is commented out so Jeff can demo without a       ║
  // ║ working cookie round-trip on Vercel. Anyone with the /admin URL  ║
  // ║ can reach the dashboard, including unauthenticated visitors.     ║
  // ║                                                                  ║
  // ║ TO RESTORE: uncomment the block below. Do NOT delete this        ║
  // ║ marker — the restore PR should remove the entire frame.          ║
  // ║                                                                  ║
  // ║ Disabled: 2026-04-19 (commit body explains the cookie issue)     ║
  // ╚══════════════════════════════════════════════════════════════════╝
  /* RESTORE-START
  if (pathname.startsWith('/admin')) {
    // Whitelist the login surfaces — both slashed and non-slashed forms,
    // because middleware runs before Next normalises the trailing slash.
    if (
      pathname === '/admin/login' ||
      pathname === '/admin/login/' ||
      pathname.startsWith('/api/admin/login')
    ) {
      return NextResponse.next();
    }

    const expected = process.env.ADMIN_PASSWORD;
    const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
    let ok = false;
    if (expected && cookie) {
      // Modern path: hashed token. Plaintext fallback covers any session
      // issued before the hash deploy.
      const expectedToken = await computeAdminCookieToken(expected);
      ok = cookie === expectedToken || cookie === expected;
    }

    if (!ok) {
      // Visible in Vercel logs — `vercel logs <deployment>` will show the
      // exact decision per request. Cheap to emit, invaluable for the
      // next time someone has to debug this gate.
      console.log(
        '[admin-gate] deny path=%s cookiePresent=%s expectedSet=%s',
        pathname,
        Boolean(cookie),
        Boolean(expected),
      );
      const url = req.nextUrl.clone();
      // Redirect with trailing slash directly — skips a 308 hop.
      url.pathname = '/admin/login/';
      url.searchParams.set('redirect', pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }
  RESTORE-END */

  if (pathname.startsWith('/account')) {
    const res = NextResponse.next();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return req.cookies.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            res.cookies.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            res.cookies.set({ name, value: '', ...options });
          },
        },
      },
    );
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      const url = req.nextUrl.clone();
      url.pathname = '/login/';
      url.searchParams.set('redirect', pathname);
      return NextResponse.redirect(url);
    }
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/account/:path*', '/admin/:path*'],
};
