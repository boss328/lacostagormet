/**
 * Admin session token helpers.
 *
 * Single shared password (ADMIN_PASSWORD env var) gates the admin. We
 * never store the plaintext password in the cookie — instead we set
 * cookie value = HMAC-SHA256(ADMIN_PASSWORD, ADMIN_SESSION_SECRET).
 *
 * Why HMAC over hash:
 *   - Rotating ADMIN_SESSION_SECRET invalidates all existing sessions
 *     without changing the password (useful if a laptop is lost).
 *   - The cookie value is a hex digest with no special chars — round-
 *     trips cleanly through every browser / proxy / edge encoding,
 *     which was the failure mode of the previous plaintext-cookie
 *     attempt on Vercel.
 *
 * Implementation uses Web Crypto (crypto.subtle) so the same code runs
 * in the Edge runtime (middleware) and the Node runtime (login route).
 * Bytes are byte-identical by construction across both.
 */

export const ADMIN_COOKIE = 'lcg_admin_session';
export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const FALLBACK_SECRET = 'fallback-change-me';

function toHex(buf: ArrayBuffer): string {
  const view = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < view.length; i++) {
    out += view[i].toString(16).padStart(2, '0');
  }
  return out;
}

/** HMAC-SHA256 the password with the session secret, return hex. */
export async function computeSessionToken(password: string): Promise<string> {
  const secret = process.env.ADMIN_SESSION_SECRET || FALLBACK_SECRET;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(password));
  return toHex(sig);
}

/**
 * Compute the token the cookie should hold for the configured password,
 * or null if ADMIN_PASSWORD isn't set. Middleware uses this for the
 * gate comparison; the login route uses it to mint the cookie.
 */
export async function expectedSessionToken(): Promise<string | null> {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return null;
  return computeSessionToken(password);
}
