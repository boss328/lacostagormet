type ShippingEnvironment = Record<string, string | undefined>;

/** Keep runtime requests, purchase gates, and setup checks on the same key. */
export function shippingApiKey(env: ShippingEnvironment) {
  return (env.SHIPSTATION_API_KEY || '').trim();
}

/** Shared runtime gates for the server and read-only configuration checker. */
export function shippingFlags(env: ShippingEnvironment, providerReady = false) {
  const apiKey = shippingApiKey(env);
  const sandboxKey = /^TEST_/i.test(apiKey);
  const production =
    env.VERCEL_ENV === 'production' ||
    (!env.VERCEL_ENV && env.NODE_ENV === 'production');
  const readOnlyPreview =
    env.READ_ONLY_PREVIEW === 'true' ||
    (env.VERCEL_ENV === 'preview' && env.READ_ONLY_PREVIEW !== 'false');
  const enabled = !env.SHIPPING_ENABLED
    ? production
    : env.SHIPPING_ENABLED === 'true';
  const writable = enabled && !readOnlyPreview;
  const purchaseEnabled = env.SHIPPING_PURCHASE_ENABLED === 'true';

  return {
    production,
    readOnlyPreview,
    enabled,
    purchaseEnabled,
    sandboxKey,
    canRecordManual: writable,
    canQuote: writable && providerReady,
    canPurchase: writable && providerReady && production && purchaseEnabled && Boolean(apiKey) && !sandboxKey,
  };
}
