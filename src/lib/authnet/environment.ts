/**
 * Sandbox / production toggle for Auth.net.
 *
 * Server reads AUTHNET_ENVIRONMENT; client reads NEXT_PUBLIC_AUTHNET_ENVIRONMENT
 * (same value, separately plumbed for the client bundle).
 *
 * Values: "sandbox" (default) | "production".
 */

export type AuthnetEnv = 'sandbox' | 'production';

export function resolveAuthnetEnv(raw: string | undefined | null): AuthnetEnv {
  return raw === 'production' ? 'production' : 'sandbox';
}

export function acceptJsUrl(env: AuthnetEnv): string {
  return env === 'production'
    ? 'https://js.authorize.net/v1/Accept.js'
    : 'https://jstest.authorize.net/v1/Accept.js';
}
