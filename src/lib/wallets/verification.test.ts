import assert from 'node:assert/strict';
import { test } from 'node:test';
import { walletConfig } from './config';
import { verifyPayPalCapture, verifyAmazonCharge, moneyMatches, type WalletAttempt, type PayPalOrder } from './verification';

const a: WalletAttempt = { id: '4cc5b92c-a9f9-4a21-a9d3-35c4efbeaaad', order_id: 'order', order_number: 'LCG-12345',
  method: 'paypal', environment: 'sandbox', total: '89.95', provider_order_id: 'PAYPALORDER1', status: 'pending', created_at: new Date().toISOString() };
const payment = (): PayPalOrder => ({ id: a.provider_order_id!, status: 'COMPLETED', purchase_units: [{
  custom_id: a.id, invoice_id: a.order_number, amount: { value: '89.95', currency_code: 'USD' },
  payee: { merchant_id: 'MERCHANT' }, payments: { captures: [{ id: 'CAPTURE1', status: 'COMPLETED',
    final_capture: true, amount: { value: '89.95', currency_code: 'USD' } }] },
}] });

test('wallets default off and live Amazon keys cannot run in sandbox', () => {
  assert.equal(walletConfig({}).paypal, false);
  const env = { WALLET_CHECKOUT_ENABLED: 'true', WALLET_CHECKOUT_ORIGIN: 'https://example.com', WALLET_CHECKOUT_SECRET: 'x'.repeat(32),
    PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 'secret', PAYPAL_MERCHANT_ID: 'merchant',
    AMAZON_PAY_MERCHANT_ID: 'merchant', AMAZON_PAY_STORE_ID: 'store', AMAZON_PAY_PUBLIC_KEY_ID: 'LIVE-key', AMAZON_PAY_PRIVATE_KEY: 'key' };
  assert.equal(walletConfig(env).paypal, true);
  assert.equal(walletConfig(env).apple_pay, false);
  assert.equal(walletConfig(env).amazon_pay, false);
  assert.equal(walletConfig({ ...env, WALLET_CHECKOUT_ORIGIN: 'http://example.com' }).paypal, false);
});
test('money checks reject precision tricks and missing values', () => {
  assert.equal(moneyMatches('89.95', '89.95'), true);
  for (const value of ['89.949', '8.995e1', '', 'NaN', undefined, '0', '89.94']) assert.equal(moneyMatches(value, '89.95'), false);
});
test('PayPal completed capture verifies the order, amount, merchant and invoice', () => {
  assert.equal(verifyPayPalCapture(payment(), a, 'MERCHANT')?.transactionId, 'CAPTURE1');
  for (const mutate of [
    (p: PayPalOrder) => { p.id = 'OTHER'; },
    (p: PayPalOrder) => { p.purchase_units![0].custom_id = 'OTHER'; },
    (p: PayPalOrder) => { p.purchase_units![0].invoice_id = 'OTHER'; },
    (p: PayPalOrder) => { p.purchase_units![0].payee!.merchant_id = 'OTHER'; },
    (p: PayPalOrder) => { p.purchase_units![0].amount!.currency_code = 'EUR'; },
    (p: PayPalOrder) => { p.purchase_units![0].payments!.captures![0].amount!.value = '1.00'; },
    (p: PayPalOrder) => { p.purchase_units![0].payments!.captures![0].final_capture = false; },
    (p: PayPalOrder) => { p.purchase_units!.push(p.purchase_units![0]); },
  ]) { const p = payment(); mutate(p); assert.throws(() => verifyPayPalCapture(p, a, 'MERCHANT')); }
});
test('approved, declined and pending captures do not mark an order paid', () => {
  const p = payment(); p.status = 'APPROVED'; assert.equal(verifyPayPalCapture(p, a, 'MERCHANT'), null);
  p.status = 'COMPLETED';
  for (const status of ['PENDING', 'DECLINED', 'FAILED']) {
    p.purchase_units![0].payments!.captures![0].status = status;
    assert.equal(verifyPayPalCapture(p, a, 'MERCHANT'), null);
  }
});
test('Amazon requires a completed session and the matching captured charge', () => {
  const attempt = { ...a, method: 'amazon_pay' as const, provider_order_id: 'AMAZONSESSION' };
  const session = { checkoutSessionId: 'AMAZONSESSION', chargeId: 'CHARGE1', chargePermissionId: 'PERMISSION1',
    merchantMetadata: { merchantReferenceId: a.id }, statusDetails: { state: 'Completed' },
    paymentDetails: { chargeAmount: { amount: '89.95', currencyCode: 'USD' } } };
  const charge = { chargeId: 'CHARGE1', chargePermissionId: 'PERMISSION1', statusDetails: { state: 'Captured' },
    captureAmount: { amount: '89.95', currencyCode: 'USD' } };
  assert.equal(verifyAmazonCharge(session, charge, attempt)?.transactionId, 'CHARGE1');
  assert.equal(verifyAmazonCharge(session, { ...charge, statusDetails: { state: 'CaptureInitiated' } }, attempt), null);
  assert.throws(() => verifyAmazonCharge(session, { ...charge, chargeId: 'OTHER' }, attempt));
  assert.throws(() => verifyAmazonCharge(session, { ...charge, chargePermissionId: 'OTHER' }, attempt));
  assert.throws(() => verifyAmazonCharge(session, { ...charge, captureAmount: { amount: '89.95', currencyCode: 'EUR' } }, attempt));
  assert.throws(() => verifyAmazonCharge({ ...session, merchantMetadata: {} }, charge, attempt));
});
