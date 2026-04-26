import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { ADMIN_COOKIE, expectedSessionToken } from '@/lib/admin/session';

/**
 * Route guards:
 *   /admin/*    — single shared password (ADMIN_PASSWORD env var)
 *                 gates the entire admin surface. Login flow at
 *                 /admin/login/ + /api/admin/login/ + /api/admin/logout/
 *                 is whitelisted so users can sign in without
 *                 authentication.
 *   /account/*  — Supabase auth session for customer accounts.
 *
 * The admin cookie value is HMAC-SHA256(ADMIN_PASSWORD, ADMIN_SESSION_SECRET)
 * — never the plaintext password. See src/lib/admin/session.ts for why.
 *
 * trailingSlash:true is set in next.config, so every redirect target
 * is written WITH a trailing slash here — Next would otherwise issue a
 * 308 to add it, and POST→308→re-POST chains were the source of the
 * previous Vercel cookie-drop bug.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Admin gate ────────────────────────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    // Whitelist the login surfaces — both slashed and non-slashed forms
    // because Next's trailingSlash normaliser runs after middleware.
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
      // Server is missing ADMIN_PASSWORD — surface a config error
      // rather than a redirect loop or a wide-open admin.
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

  // ── Customer account gate ────────────────────────────────────────────
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
