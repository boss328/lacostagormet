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

/**
 * URL for AcceptUI.js — the hosted-iframe widget. Delegates click handlers
 * to any element with class="AcceptUI". Distinct from Accept.js (the lower-
 * level tokenization API at /v1/Accept.js) which we are NOT using.
 */
export function acceptUiUrl(env: AuthnetEnv): string {
  return env === 'production'
    ? 'https://js.authorize.net/v3/AcceptUI.js'
    : 'https://jstest.authorize.net/v3/AcceptUI.js';
}
