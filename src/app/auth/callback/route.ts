import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendTransactionalEmail } from '@/lib/email/send';
import { renderWelcomeEmail } from '@/lib/email/templates/welcome';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Magic-link callback. Exchanges the auth code for a session via the
 * canonical @supabase/ssr server client (cookie writes auto-attach to
 * the eventual NextResponse), then redirects to `?redirect=<path>` or
 * /account.
 *
 * Side-effect: when the resolved user's last_sign_in_at lands within
 * 30s of created_at, treat as a fresh signup and fire the welcome
 * email fire-and-forget. Failures are logged inside the helper and
 * never block the redirect.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const redirect = url.searchParams.get('redirect') || '/account';

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', url.origin));
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth/callback] exchange failed:', error.message);
    return NextResponse.redirect(new URL('/login?error=exchange', url.origin));
  }

  // First-sign-in welcome email (non-blocking).
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

  // Open-redirect guard — only honour relative same-site paths.
  const safeRedirect =
    redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/account';

  return NextResponse.redirect(new URL(safeRedirect, url.origin));
}
