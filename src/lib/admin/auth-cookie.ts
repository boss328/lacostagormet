/**
 * Admin auth cookie helpers.
 *
 * The login flow used to store the plaintext password in the lcg_admin
 * cookie. That round-tripped fine in dev but produced an infinite redirect
 * loop on Vercel when ADMIN_PASSWORD contained whitespace or shell-special
 * characters: the cookie's value got URL-encoded on set, decoded on read,
 * and the strict `cookie !== expected` comparison stopped matching.
 *
 * The fix: store sha256(password + password) — a deterministic hex token
 * derived from the env var. Hex digits round-trip through every cookie
 * encoding cleanly, and the cookie no longer exposes the password to
 * anyone who manages to read it.
 *
 * Back-compat: middleware accepts BOTH the new hash AND the old
 * plain-password value, so existing sessions keep working through the
 * deploy. Browsers refresh to the hash on next login.
 *
 * Implementation uses Web Crypto (globalThis.crypto.subtle) which is
 * available in both Edge runtime (middleware) and Node 20+ runtime
 * (the login route). Same code path on both sides, so the hex output is
 * byte-identical by construction.
 */

export const ADMIN_COOKIE = 'lcg_admin';

/** 90 days when the user opts to "Remember this device". */
export const REMEMBER_MAX_AGE = 60 * 60 * 24 * 90;

function toHex(buf: ArrayBuffer): string {
  const view = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < view.length; i++) {
    out += view[i].toString(16).padStart(2, '0');
  }
  return out;
}

export async function computeAdminCookieToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(password + password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(digest);
}
