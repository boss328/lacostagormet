export type WalletMethod = 'paypal' | 'apple_pay' | 'amazon_pay';
export type WalletEnvironment = 'sandbox' | 'live';

export function walletConfig(env: Readonly<Record<string, string | undefined>> = process.env) {
  const environment: WalletEnvironment = env.WALLET_ENVIRONMENT === 'live' ? 'live' : 'sandbox';
  const origin = env.WALLET_CHECKOUT_ORIGIN ?? '';
  let validOrigin = false;
  try { const url = new URL(origin); validOrigin = url.protocol === 'https:' && url.origin === origin; } catch {}
  const ready = env.WALLET_CHECKOUT_ENABLED === 'true' && validOrigin && (env.WALLET_CHECKOUT_SECRET?.length ?? 0) >= 32;
  const paypal = ready && !!env.PAYPAL_CLIENT_ID && !!env.PAYPAL_CLIENT_SECRET && !!env.PAYPAL_MERCHANT_ID;
  const amazon = ready && !!env.AMAZON_PAY_MERCHANT_ID && !!env.AMAZON_PAY_STORE_ID &&
    !!env.AMAZON_PAY_PUBLIC_KEY_ID && !!env.AMAZON_PAY_PRIVATE_KEY &&
    env.AMAZON_PAY_PUBLIC_KEY_ID.startsWith(environment === 'live' ? 'LIVE-' : 'SANDBOX-');
  return { environment, origin, paypal, apple_pay: paypal && env.PAYPAL_APPLE_PAY_ENABLED === 'true', amazon_pay: amazon };
}
