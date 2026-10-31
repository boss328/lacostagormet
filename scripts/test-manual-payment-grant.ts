import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const origin = 'https://store.example.test';
const orderId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const orderNumber = 'LCG-TEST';
const ctx = { params: { orderNumber } };
const quoted = { orderId, amountCents: 5942 };
type Grant = typeof quoted;
type GrantLibrary = typeof import('../src/lib/checkout/manual-payment-grant');
type IssueRoute = typeof import('../src/app/api/admin/orders/[orderNumber]/payment-link/route');
type OpenRoute = typeof import('../src/app/pay/open/[grant]/route');
type PayRoute = typeof import('../src/app/api/checkout/manual-pay/route');

function load<T>(path: string, modules: Record<string, unknown>, env: Record<string, string | undefined>, now: () => number): T {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const target = { exports: {} };
  new Function('require', 'module', 'exports', 'process', 'Date', compiled)((key: string) => {
    assert.ok(key in modules, `Unexpected module ${key}`);
    return modules[key];
  }, target, target.exports, { env }, class extends Date { static now() { return now(); } });
  return target.exports as T;
}

function fixture() {
  const state = {
    now: Date.UTC(2026, 9, 31), token: 'test-admin', preview: false, reads: 0, payments: [] as Grant[],
    env: { ADMIN_SESSION_SECRET: 'fixture-secret-used-only-in-memory', AUTHNET_ENVIRONMENT: 'sandbox' } as Record<string, string | undefined>,
    order: { id: orderId, total: '59.42', source: 'manual', status: 'pending' },
  };
  const boundaries = { 'server-only': {}, 'node:crypto': require('node:crypto') };
  const grants = load<GrantLibrary>('../src/lib/checkout/manual-payment-grant.ts', boundaries, state.env, () => state.now);
  const modules = {
    ...boundaries, 'next/server': require('next/server'),
    '@/lib/checkout/manual-payment-grant': grants,
    '@/lib/admin/session': { ADMIN_COOKIE: 'admin-cookie', expectedSessionToken: async () => state.token },
    '@/lib/preview-mode': { isReadOnlyPreview: () => state.preview },
    '@/lib/supabase/admin': { createAdminClient: () => ({
      from(table: string) {
        assert.equal(table, 'orders');
        state.reads++;
        const builder = {
          select() { return builder; },
          eq(key: string, value: string) { assert.deepEqual([key, value], ['order_number', orderNumber]); return builder; },
          async maybeSingle() { return { data: state.order, error: null }; },
        };
        return builder;
      },
    }) },
    '@/lib/checkout/manual-hosted': { startManualHostedPayment: async (grant: Grant) => {
      state.payments.push(grant);
      return { success: true, formToken: 'fixture-form', hostedUrl: 'https://gateway.example.test' };
    } },
  };
  const issue = load<IssueRoute>('../src/app/api/admin/orders/[orderNumber]/payment-link/route.ts', modules, state.env, () => state.now);
  const open = load<OpenRoute>('../src/app/pay/open/[grant]/route.ts', modules, state.env, () => state.now);
  const pay = load<PayRoute>('../src/app/api/checkout/manual-pay/route.ts', modules, state.env, () => state.now);
  return { state, grants,
    issue: (token = 'test-admin', requestOrigin = origin) => issue.POST(new NextRequest(`${origin}/api/admin/orders/${orderNumber}/payment-link/`, {
      method: 'POST', headers: { cookie: `admin-cookie=${token}`, origin: requestOrigin },
    }), ctx),
    open: (grant: string) => open.GET(new NextRequest(`${origin}/pay/open/${grant}/`), { params: { grant } }),
    pay: (token: string, body: unknown, requestOrigin = origin) => pay.POST(new NextRequest(`${origin}/api/checkout/manual-pay/`, {
      method: 'POST', headers: { cookie: `${grants.MANUAL_PAYMENT_COOKIE}=${token}`, origin: requestOrigin, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })),
  };
}

test('a payment grant is bound to its order and amount until the exact expiry', () => {
  const { grants, state } = fixture();
  const token = grants.issueManualPaymentGrant(quoted)!;
  assert.deepEqual(grants.verifyManualPaymentGrant(token), quoted);
  const [id, cents, expiry, mac] = token.split('.');
  for (const modified of [
    [otherId, cents, expiry, mac], [id, '1', expiry, mac], [id, cents, String(Number(expiry) + 1), mac],
    [id, cents, expiry, (mac[0] === 'a' ? 'b' : 'a') + mac.slice(1)],
  ]) assert.equal(grants.verifyManualPaymentGrant(modified.join('.')), null);
  for (const invalid of ['', 'bad', token + '.extra', token + 'a'.repeat(201)]) assert.equal(grants.verifyManualPaymentGrant(invalid), null);
  state.now += grants.MANUAL_LINK_LIFETIME * 1000 - 1;
  assert.deepEqual(grants.verifyManualPaymentGrant(token), quoted);
  state.now++;
  assert.equal(grants.verifyManualPaymentGrant(token), null);
});

test('invalid grant inputs and missing or rotated signing secrets fail closed', () => {
  const { grants, state } = fixture();
  for (const amountCents of [0, -1, 2.5, NaN, Infinity]) {
    assert.equal(grants.issueManualPaymentGrant({ orderId, amountCents }), null);
  }
  assert.equal(grants.issueManualPaymentGrant({ orderId: 'LCG-TEST', amountCents: 100 }), null);
  const previous = grants.issueManualPaymentGrant(quoted)!;
  delete state.env.ADMIN_SESSION_SECRET;
  assert.equal(grants.issueManualPaymentGrant(quoted), null);
  assert.equal(grants.verifyManualPaymentGrant(previous), null);
  state.env.ADMIN_SESSION_SECRET = 'rotated-fixture-secret';
  assert.equal(grants.verifyManualPaymentGrant(previous), null);
});

test('issuing a link requires the merchant session, same origin and writable storefront', async () => {
  const f = fixture();
  assert.equal((await f.issue('wrong-token')).status, 401);
  assert.equal((await f.issue('test-admin','https://unrelated.example.test')).status, 403);
  assert.equal((await f.issue('test-admin','')).status, 403);
  f.state.preview = true;
  assert.equal((await f.issue()).status, 403);
  assert.equal(f.state.reads, 0);
});

test('only a positive pending manual order gets a link to its stored total', async () => {
  const f = fixture();
  for (const patch of [
    { status: 'paid' }, { status: 'payment_held' }, { status: 'cancelled' }, { source: 'website' }, { total: '0.00' },
  ]) {
    const original = f.state.order;
    f.state.order = { ...original, ...patch };
    assert.equal((await f.issue()).status, 409);
    f.state.order = original;
  }
  const res = await f.issue();
  assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control')!, /no-store/);
  const { path } = await res.json();
  const grant = path.match(/^\/pay\/open\/([^/]+)\/$/);
  assert.ok(grant);
  assert.deepEqual(f.grants.verifyManualPaymentGrant(grant[1]), quoted);
  delete f.state.env.ADMIN_SESSION_SECRET;
  assert.equal((await f.issue()).status, 503);
});

test('opening a link exchanges the URL for an HTTP-only cookie without forwarding the grant in the URL', () => {
  const f = fixture();
  const grant = f.grants.issueManualPaymentGrant(quoted)!;
  const res = f.open(grant);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), origin + '/pay/');
  assert.match(res.headers.get('cache-control')!, /no-store/);
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  const cookie = res.cookies.get(f.grants.MANUAL_PAYMENT_COOKIE)!;
  assert.equal(cookie.value, grant);
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.secure, true);
  assert.equal(cookie.sameSite, 'lax');
  const invalid = f.open(grant + 'x');
  assert.equal(invalid.cookies.get(f.grants.MANUAL_PAYMENT_COOKIE)?.maxAge, 0);
  assert.equal(invalid.headers.get('location'), origin + '/pay/');
});

test('starting payment requires the exact reviewed link and uses only signed order data', async () => {
  const f = fixture();
  const grant = f.grants.issueManualPaymentGrant(quoted)!;
  const other = f.grants.issueManualPaymentGrant({ orderId: otherId, amountCents: 1 })!;
  const reviewId = f.grants.manualPaymentReviewId(grant);
  assert.equal((await f.pay('', { reviewId })).status, 403);
  assert.equal((await f.pay(grant, { reviewId }, 'https://unrelated.example.test')).status, 403);
  assert.equal((await f.pay(other, { reviewId })).status, 409);
  assert.equal((await f.pay(grant, { orderId, amountCents: 1 })).status, 409);
  f.state.preview = true;
  assert.equal((await f.pay(grant, { reviewId })).status, 409);
  assert.equal(f.state.payments.length, 0);
  f.state.preview = false;
  const res = await f.pay(grant, { reviewId, orderId: otherId, amountCents: 1, total: 0.01 });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control')!, /no-store/);
  assert.deepEqual(f.state.payments, [quoted]);
});

test('customer review displays the saved quote and withholds payment when its amount or status changes', async () => {
  const f = fixture();
  let token = '';
  const order = {
    id: orderId, order_number: orderNumber, source: 'manual', status: 'pending', total: '59.42', subtotal: '49.47', shipping_cost: '9.95', tax: '0',
    order_items: [{ product_name: 'Single canister', quantity: 3, unit_price: '16.49', line_subtotal: '49.47' }],
  };
  const page = load<typeof import('../src/app/pay/page')>('../src/app/pay/page.tsx', {
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/headers': { cookies: () => ({ get: (name: string) => name === f.grants.MANUAL_PAYMENT_COOKIE ? { value: token } : undefined }) },
    '@/lib/checkout/manual-payment-grant': f.grants,
    '@/lib/preview-mode': { isReadOnlyPreview: () => false },
    '@/components/checkout/ManualPaymentButton': { ManualPaymentButton: ({ total }: { total: string }) => createElement('button', {}, 'Pay ' + total) },
    '@/components/checkout/PendingPaymentPoller': { PendingPaymentPoller: () => null },
    '@/lib/supabase/admin': { createAdminClient: () => ({
      from(table: string) {
        assert.equal(table, 'orders');
        f.state.reads++;
        const filters = new Map<string, string>();
        const builder = {
          select(columns: string) {
            assert.doesNotMatch(columns, /customer_email|shipping_address|billing_address|phone|card_/);
            return builder;
          },
          eq(key: string, value: string) { filters.set(key, value); return builder; },
          async maybeSingle() {
            assert.equal(filters.get('id'), orderId);
            assert.equal(filters.get('source'), 'manual');
            return { data: order, error: null };
          },
        };
        return builder;
      },
    }) },
  }, f.state.env, () => f.state.now);
  const render = async () => renderToStaticMarkup(await page.default({ searchParams: {} }));
  assert.doesNotMatch(await render(), /Single canister|<button/);
  assert.equal(f.state.reads, 0);
  token = f.grants.issueManualPaymentGrant(quoted)!;
  const html = await render();
  assert.match(html, /3 × \$16\.49/);
  assert.match(html, /\$49\.47/);
  assert.match(html, /\$9\.95/);
  assert.match(html, /<button>Pay \$59\.42<\/button>/);
  assert.ok(!html.includes(token));
  const returned = renderToStaticMarkup(await page.default({ searchParams: { returned: '1', order: orderNumber } }));
  assert.match(returned, /checking the payment/);
  assert.doesNotMatch(returned, /<button/);
  order.status = 'paid';
  assert.doesNotMatch(await render(), /<button/);
  order.status = 'pending';
  order.total = '59.43';
  assert.doesNotMatch(await render(), /Single canister|<button/);
});
