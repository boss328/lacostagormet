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

/** Accept Hosted payment page URL — the customer's browser POSTs a form
 *  token here and Auth.net renders the hosted card-entry page. */
export function hostedPaymentUrl(env: AuthnetEnv): string {
  return env === 'production'
    ? 'https://accept.authorize.net/payment/payment'
    : 'https://test.authorize.net/payment/payment';
}

/** JSON API endpoint — where getHostedPaymentPageRequest + getTransactionDetailsRequest go. */
export function apiEndpoint(env: AuthnetEnv): string {
  return env === 'production'
    ? 'https://api.authorize.net/xml/v1/request.api'
    : 'https://apitest.authorize.net/xml/v1/request.api';
}
