import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { sendTransactionalEmail } from '@/lib/email/send';
import { renderWelcomeEmail } from '@/lib/email/templates/welcome';

/**
 * Supabase magic-link callback. Exchanges the auth code (either in the query
 * string or hash fragment) for a session, then redirects to the original
 * destination. The cookies/get/set plumbing mirrors src/lib/supabase/server.ts
 * but writes to the response so the session cookie lands on this request.
 */

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const redirect = url.searchParams.get('redirect') || '/account';

  const res = NextResponse.redirect(new URL(redirect, url.origin));

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', url.origin));
  }

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
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

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error('[auth/callback] exchange failed', error.message);
    return NextResponse.redirect(new URL('/login?error=exchange', url.origin));
  }

  // First sign-in detection — Supabase populates user.created_at on the
  // first OTP exchange. We treat any session whose `last_sign_in_at`
  // is within 30 seconds of `created_at` as a brand-new account and
  // fire a welcome email. Avoids needing a separate signup flow for
  // a magic-link-only auth setup.
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
      // Fire-and-forget — never block the auth redirect on email.
      void sendTransactionalEmail({
        to: user.email,
        subject: 'Welcome to La Costa Gourmet',
        html: tpl.html,
        text: tpl.text,
        tags: [{ name: 'type', value: 'welcome' }],
      });
    }
  }

  return res;
}
