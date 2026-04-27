import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { sendTransactionalEmail } from '@/lib/email/send';
import { renderWelcomeEmail } from '@/lib/email/templates/welcome';

/**
 * Supabase magic-link callback.
 *
 * Canonical Supabase + Next.js 14 pattern: write cookies via
 * `cookies().set(...)` from next/headers. In a Route Handler, those
 * writes are automatically attached to the eventual NextResponse — no
 * manual `res.cookies.set` plumbing required. The previous
 * pre-build-the-redirect-then-mutate-it pattern occasionally lost the
 * intermediate cookies that `exchangeCodeForSession` writes (it
 * clears the PKCE verifier and sets the session in one call), which
 * surfaced as the "PKCE code verifier not found in storage" error.
 *
 * Welcome-email side-effect: when a session lands within ~30s of the
 * user's `created_at`, treat it as a first sign-in and fire the
 * welcome template. Fire-and-forget — never blocks the redirect.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  // Honour both ?redirect= (legacy LoginForm convention) and ?next=
  // (canonical Supabase docs example) — whichever is present.
  const redirectTarget =
    url.searchParams.get('next') || url.searchParams.get('redirect') || '/account/';

  if (!code) {
    return NextResponse.redirect(new URL('/login/?error=missing_code', url.origin));
  }

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { flowType: 'pkce' },
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          // Wrapped so a Server Component caller (which can't mutate
          // cookies) doesn't crash the route. In this Route Handler
          // path the write succeeds and Next attaches it to the
          // returned response.
          try {
            cookieStore.set({ name, value, ...options });
          } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {}
        },
      },
    },
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error('[auth/callback] exchange failed', error.message);
    return NextResponse.redirect(
      new URL(`/login/?error=${encodeURIComponent(error.message)}`, url.origin),
    );
  }

  // First sign-in detection — Supabase populates user.created_at on
  // first OTP exchange. Treat any session whose last_sign_in_at is
  // within 30s of created_at as a brand-new account → welcome email.
  const user = data.user;
  if (user?.email) {
    const created = user.created_at ? new Date(user.created_at).getTime() : 0;
    const lastSignIn = user.last_sign_in_at
      ? new Date(user.last_sign_in_at).getTime()
      : Date.now();
    const isFirstSignIn = created > 0 && Math.abs(lastSignIn - created) < 30_000;
    if (isFirstSignIn) {
      const firstName =
        (user.user_metadata?.first_name as string | undefined) ?? null;
      const tpl = renderWelcomeEmail({
        customerEmail: user.email,
        firstName,
      });
      void sendTransactionalEmail({
        to: user.email,
        subject: 'Welcome to La Costa Gourmet',
        html: tpl.html,
        text: tpl.text,
        tags: [{ name: 'type', value: 'welcome' }],
      });
    }
  }

  // Anchor the redirect target to a relative admin/account path —
  // never honour an absolute URL or a path that escapes the site
  // (open-redirect guard).
  const safeRedirect = redirectTarget.startsWith('/') && !redirectTarget.startsWith('//')
    ? redirectTarget
    : '/account/';

  return NextResponse.redirect(new URL(safeRedirect, url.origin));
}
