import assert from 'node:assert/strict';
import { loadEnvFile } from 'node:process';
loadEnvFile('.env.local');
const base = process.argv[2] || 'http://localhost:4181';
assert.ok(
  /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base),
  'Local review server only',
);
assert.equal(
  process.env.READ_ONLY_PREVIEW,
  'true',
  'Read-only review must be enabled',
);
let checks = 0;
const setupRequired = [];
async function get(path, options = {}) {
  const response = await fetch(base + path, { redirect: 'manual', ...options });
  checks++;
  return response;
}
for (const path of [
  '/',
  '/shop/',
  '/shop/chai-matcha/',
  '/brand/',
  '/brand/big-train/',
  '/search/?q=chai',
  '/cart/',
  '/checkout/',
  '/for-business/',
  '/contact/',
  '/shipping/',
  '/returns/',
  '/privacy/',
  '/terms/',
  '/login/',
]) {
  const response = await get(path);
  assert.equal(response.status, 200, path);
  const body = await response.text();
  assert.ok(!body.includes('Something went wrong'), path);
}
for (const path of ['/shop/unknown-ui-check/', '/brand/unknown-ui-check/'])
  assert.equal((await get(path)).status, 404, path);
for (const path of [
  '/account/',
  '/account/orders/',
  '/account/addresses/',
  '/account/settings/',
  '/admin/',
  '/api/admin/search/?q=chai',
]) {
  assert.ok([303, 307].includes((await get(path)).status), path);
}
for (const path of [
  '/api/checkout/create/',
  '/api/inquiries/submit/',
  '/api/cart/save/',
  '/api/admin/products/create/',
  '/api/webhooks/authnet/',
]) {
  assert.equal(
    (
      await get(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    ).status,
    409,
    path,
  );
}
for (const path of [
  '/api/cron/send-abandoned-cart-emails/',
  '/api/checkout/hosted-callback/',
  '/auth/callback/?code=review',
  '/unsubscribe/?token=review',
])
  assert.equal((await get(path)).status, 409, path);
const login = await get('/api/admin/login/', {
  method: 'POST',
  body: new URLSearchParams({ password: process.env.ADMIN_PASSWORD }),
});
assert.equal(login.status, 303);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie?.startsWith('lcg_admin_session='));
for (const path of [
  '/admin/',
  '/admin/?range=7d',
  '/admin/orders/?view=pending-fulfillment',
  '/admin/customers/?q=example',
  '/admin/products/?q=chai',
  '/admin/vendors/',
  '/admin/purchase-orders/?status=draft',
  '/admin/inquiries/?status=new',
  '/admin/categories/',
  '/admin/brands/',
  '/admin/imports/',
  '/admin/settings/',
]) {
  const response = await get(path, { headers: { cookie } });
  assert.equal(response.status, 200, path);
  const body = await response.text();
  assert.ok(!body.includes('We couldn’t load this page.'), path);
  if (body.includes('A database update is needed.')) setupRequired.push(path);
}
const search = await get('/api/admin/search/?q=Big%20Train', {
  headers: { cookie },
});
assert.equal(search.status, 200);
const results = (await search.json()).results;
assert.ok(
  results.some(
    (result) =>
      result.group === 'product' &&
      result.label.toLowerCase().includes('big train'),
  ),
);
const literal = await get('/api/admin/search/?q=%2A', { headers: { cookie } });
assert.equal(literal.status, 200);
assert.equal((await literal.json()).results.length, 0);
console.log(
  JSON.stringify(
    {
      checks,
      publicRoutes: 'pass',
      authGuards: 'pass',
      adminReadRoutes: 'pass (available schema)',
      setupRequired,
      adminSearch: 'pass',
      previewWriteBlocks: 'pass',
    },
    null,
    2,
  ),
);
