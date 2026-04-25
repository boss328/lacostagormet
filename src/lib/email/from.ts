/**
 * Canonical email addresses for La Costa Gourmet transactional + marketing
 * mail. Read at module-load via process.env, with safe defaults so a fresh
 * dev environment doesn't crash.
 *
 * customercare@lacostagourmet.com is the public-facing address; orders and
 * marketing both come from there. ADMIN_NOTIFY_EMAIL is the internal
 * recipient for new-order alerts (Jeff or whoever covers ops).
 */

export const EMAIL_FROM =
  process.env.RESEND_FROM_EMAIL ?? 'customercare@lacostagourmet.com';

export const EMAIL_REPLY_TO =
  process.env.RESEND_FROM_EMAIL ?? 'customercare@lacostagourmet.com';

export const ADMIN_NOTIFY_EMAIL =
  process.env.ADMIN_NOTIFY_EMAIL ?? 'jeff@lacostagourmet.com';

/**
 * Best-effort site origin for absolute links inside emails. Resend renders
 * the email server-side, so request headers aren't available; fall back to
 * the production hostname when the env var is missing.
 */
export const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.VERCEL_URL ??
  'https://lacostagourmet.com';

export function absoluteUrl(path: string): string {
  const base = SITE_ORIGIN.startsWith('http')
    ? SITE_ORIGIN
    : `https://${SITE_ORIGIN}`;
  return new URL(path, base).toString();
}
