import 'server-only';
import { walletConfig } from './config';
import type { PayPalOrder, WalletAttempt } from './verification';

async function request(path: string, method: 'GET' | 'POST', idempotency?: string, body?: unknown): Promise<PayPalOrder> {
  const base = walletConfig().environment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  const credentials = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const auth = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST', headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials', cache: 'no-store', signal: AbortSignal.timeout(15000),
  });
  if (!auth.ok) throw new Error('PayPal authentication failed');
  const token = await auth.json() as { access_token?: string };
  if (!token.access_token) throw new Error('Missing PayPal access token');
  const res = await fetch(`${base}${path}`, {
    method, headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json',
      ...(idempotency ? { 'PayPal-Request-Id': idempotency } : {}), Prefer: 'return=representation' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}), cache: 'no-store', signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`PayPal request failed (${res.status})`);
  return res.json();
}
export function createPayPalOrder(a: WalletAttempt) {
  return request('/v2/checkout/orders', 'POST', `${a.id.replace(/-/g, '')}-new`, {
    intent: 'CAPTURE', purchase_units: [{ reference_id: a.id, custom_id: a.id, invoice_id: a.order_number,
      payee: { merchant_id: process.env.PAYPAL_MERCHANT_ID },
      amount: { currency_code: 'USD', value: Number(a.total).toFixed(2) } }],
    ...(a.method === 'paypal' ? { payment_source: { paypal: { experience_context: {
      brand_name: 'La Costa Gourmet', shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW',
    } } } } : {}),
  });
}
export function getPayPalOrder(id: string) { return request(`/v2/checkout/orders/${encodeURIComponent(id)}`, 'GET'); }
export function capturePayPalOrder(a: WalletAttempt) {
  if (!a.provider_order_id) throw new Error('Missing PayPal order');
  return request(`/v2/checkout/orders/${encodeURIComponent(a.provider_order_id)}/capture`, 'POST', `${a.id.replace(/-/g, '')}-cap`, {});
}
