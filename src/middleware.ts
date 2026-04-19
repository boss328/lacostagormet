import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { ADMIN_COOKIE, computeAdminCookieToken } from '@/lib/admin/auth-cookie';

/**
 * Route guards:
 *   /account/* — requires a Supabase auth session (magic-link customer login)
 *   /admin/*   — requires an admin password cookie (Phase 6 gate, Phase 7
 *                replaces this with a real admin role)
 *
 * The admin-login page + the /api/admin/login route are publicly reachable
 * so the gate itself isn't locked behind the gate.
 *
 * Cookie comparison accepts both the new sha256 hash AND the legacy
 * plain-password value — back-compat for sessions established before the
 * hash rollout. See src/lib/admin/auth-cookie.ts for why we hash.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/admin')) {
    if (pathname === '/admin/login' || pathname === '/admin/login/' || pathname.startsWith('/api/admin/login')) {
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
      const url = req.nextUrl.clone();
      url.pathname = '/admin/login';
      url.searchParams.set('redirect', pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

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
      url.pathname = '/login';
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
