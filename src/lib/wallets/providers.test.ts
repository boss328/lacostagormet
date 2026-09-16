import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import { createPayPalOrder, capturePayPalOrder } from './paypal';
import { amazonButtonConfig } from './amazon';
import type { WalletAttempt } from './verification';

const a: WalletAttempt = { id: '4cc5b92c-a9f9-4a21-a9d3-35c4efbeaaad', order_id: 'order', order_number: 'LCG-12345',
  method: 'paypal', environment: 'sandbox', total: '89.95', provider_order_id: 'PAYPALORDER1', status: 'pending', created_at: new Date().toISOString() };
test('PayPal uses server total, sandbox API and stable request IDs for retry', async () => {
  const fetchBefore = global.fetch;
  const envBefore = { ...process.env };
  const calls: Array<{ url: string; options?: RequestInit }> = [];
  process.env.PAYPAL_CLIENT_ID = 'sandbox-client'; process.env.PAYPAL_CLIENT_SECRET = 'sandbox-secret';
  process.env.PAYPAL_MERCHANT_ID = 'merchant'; process.env.WALLET_ENVIRONMENT = 'sandbox';
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify(String(url).endsWith('/token') ? { access_token: 'test-only' } : { id: 'PAYPALORDER1' }), { status: 200 });
  };
  try {
    await createPayPalOrder(a); await createPayPalOrder(a); await capturePayPalOrder(a); await capturePayPalOrder(a);
    const orders = calls.filter(c => !c.url.endsWith('/token'));
    assert.ok(orders.every(c => c.url.startsWith('https://api-m.sandbox.paypal.com/')));
    const ids = orders.map(c => (c.options!.headers as Record<string, string>)['PayPal-Request-Id']);
    assert.equal(ids[0], ids[1]); assert.equal(ids[2], ids[3]); assert.notEqual(ids[0], ids[2]);
    assert.ok(ids.every(id => id.length <= 38));
    const body = JSON.parse(orders[0].options!.body as string);
    assert.equal(body.purchase_units[0].amount.value, '89.95');
    assert.equal(body.purchase_units[0].custom_id, a.id);
    assert.equal(body.purchase_units[0].payee.merchant_id, 'merchant');
  } finally { global.fetch = fetchBefore; process.env = envBefore; }
});
test('Amazon button signature contains only a selection session, with no charge before server binding', () => {
  const envBefore = { ...process.env };
  try {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' } });
    process.env.AMAZON_PAY_PRIVATE_KEY = privateKey;
    process.env.AMAZON_PAY_PUBLIC_KEY_ID = 'SANDBOX-test';
    process.env.AMAZON_PAY_STORE_ID = 'test-store';
    process.env.WALLET_CHECKOUT_ORIGIN = 'https://checkout.example.com';
    const result = amazonButtonConfig({ ...a, method: 'amazon_pay' });
    const payload = JSON.parse(result.payloadJSON);
    assert.equal(payload.merchantMetadata.merchantReferenceId, a.id);
    assert.equal(payload.paymentDetails, undefined);
    assert.equal(new URL(payload.webCheckoutDetails.checkoutReviewReturnUrl).pathname, '/api/checkout/wallet/amazon-review/');
    assert.equal(result.algorithm, 'AMZN-PAY-RSASSA-PSS-V2');
    assert.ok(result.signature.length > 100);
    assert.ok(!JSON.stringify(result).includes('PRIVATE KEY'));
  } finally { process.env = envBefore; }
});
