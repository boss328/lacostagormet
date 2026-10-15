import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { shippingApiKey, shippingFlags } from './flags';

test('production defaults allow manual dispatch without provider setup or purchase activation', () => {
  for (const env of [{ VERCEL_ENV: 'production' }, { NODE_ENV: 'production' }]) {
    const flags = shippingFlags(env);
    assert.equal(flags.enabled, true);
    assert.equal(flags.canRecordManual, true);
    assert.equal(flags.canQuote, false);
    assert.equal(flags.canPurchase, false);
    assert.equal(shippingFlags(env, true).canQuote, true);
    assert.equal(shippingFlags(env, true).canPurchase, false);
  }
});

test('production purchases require explicit activation and provider readiness', () => {
  const env = { VERCEL_ENV: 'production', SHIPPING_PURCHASE_ENABLED: 'true', SHIPSTATION_API_KEY: 'synthetic-live-key' };
  assert.equal(shippingFlags(env).canRecordManual, true);
  assert.equal(shippingFlags(env).canPurchase, false);
  assert.equal(shippingFlags(env, true).canPurchase, true);
  assert.equal(shippingFlags({ ...env, SHIPPING_PURCHASE_ENABLED: 'false' }, true).canPurchase, false);
});

test('sandbox credentials allow quotes but cannot purchase labels for real orders', () => {
  for (const key of ['TEST_synthetic', '  TEST_synthetic  ', 'test_synthetic']) {
    const flags = shippingFlags({ VERCEL_ENV: 'production', SHIPPING_PURCHASE_ENABLED: 'true', SHIPSTATION_API_KEY: key }, true);
    assert.equal(flags.sandboxKey, true);
    assert.equal(flags.canRecordManual, true);
    assert.equal(flags.canQuote, true);
    assert.equal(flags.canPurchase, false);
  }
});

test('key normalization is shared and an absent key never opens the purchase gate', () => {
  for (const key of [undefined, '', '   ']) {
    const env = { VERCEL_ENV: 'production', SHIPPING_PURCHASE_ENABLED: 'true', SHIPSTATION_API_KEY: key };
    assert.equal(shippingApiKey(env), '');
    assert.equal(shippingFlags(env, true).canPurchase, false);
  }
  const env = { VERCEL_ENV: 'production', SHIPPING_PURCHASE_ENABLED: 'true', SHIPSTATION_API_KEY: '  synthetic-live-key\n' };
  assert.equal(shippingApiKey(env), 'synthetic-live-key');
  assert.equal(shippingFlags(env, true).sandboxKey, false);
  assert.equal(shippingFlags(env, true).canPurchase, true);
});

test('the configuration checker matches purchase gates without printing keys or addresses', () => {
  const script = fileURLToPath(new URL('../../../scripts/check-shipping-config.ts', import.meta.url));
  const address = JSON.stringify({ name: 'Private Fixture Contact', phone: '5555550100', address1: '123 Private Fixture Street', city: 'Test', state: 'CA', zip: '92009' });
  for (const fixture of [
    { key: '  TEST_synthetic-private-key  ', purchase: 'true', exit: 1, sandbox: true, quote: true, buy: false },
    { key: 'TEST_synthetic-private-key', purchase: 'false', exit: 0, sandbox: true, quote: true, buy: false },
    { key: '  synthetic-private-live-key  ', purchase: 'true', exit: 0, sandbox: false, quote: true, buy: true },
    { key: '   ', purchase: 'false', exit: 0, sandbox: false, quote: false, buy: false },
  ]) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', script], {
      encoding: 'utf8', timeout: 15_000,
      env: {
        ...process.env,
        VERCEL_ENV: 'production', NODE_ENV: 'production', READ_ONLY_PREVIEW: 'false',
        SHIPPING_ENABLED: 'true', SHIPPING_PURCHASE_ENABLED: fixture.purchase,
        SHIPSTATION_API_KEY: fixture.key,
        SHIPSTATION_SHIP_FROM_JSON: address, SHIPSTATION_RETURN_TO_JSON: address,
      },
    });
    const output = `${result.stdout}${result.stderr}`;
    assert.equal(result.status, fixture.exit, output);
    assert.equal(output.includes('SANDBOX KEY:'), fixture.sandbox);
    assert.ok(output.includes(`Rate quote gate: ${fixture.quote ? 'open' : 'closed'}`));
    assert.ok(output.includes(`Label purchase gate: ${fixture.buy ? 'open' : 'closed'}`));
    assert.match(output, /Carrier access: not checked/);
    assert.doesNotMatch(output, /synthetic-private|Private Fixture|5555550100/);
  }
});

test('the explicit disable switch closes every mutation gate in production', () => {
  const flags = shippingFlags({ VERCEL_ENV: 'production', SHIPPING_ENABLED: 'false', SHIPPING_PURCHASE_ENABLED: 'true' }, true);
  assert.equal(flags.enabled, false);
  assert.equal(flags.canRecordManual, false);
  assert.equal(flags.canQuote, false);
  assert.equal(flags.canPurchase, false);
});

test('preview builds remain closed by default even when NODE_ENV is production', () => {
  const env = { VERCEL_ENV: 'preview', NODE_ENV: 'production', SHIPPING_PURCHASE_ENABLED: 'true' };
  assert.equal(shippingFlags(env, true).enabled, false);
  assert.equal(shippingFlags(env, true).canRecordManual, false);
  const explicitlyEnabled = shippingFlags({ ...env, SHIPPING_ENABLED: 'true' }, true);
  assert.equal(explicitlyEnabled.canRecordManual, false);
  assert.equal(explicitlyEnabled.canPurchase, false);
  const writablePreview = shippingFlags({ ...env, SHIPPING_ENABLED: 'true', READ_ONLY_PREVIEW: 'false' }, true);
  assert.equal(writablePreview.canRecordManual, true);
  assert.equal(writablePreview.canPurchase, false);
});

test('local development defaults closed and explicit enablement never bypasses the production purchase gate', () => {
  assert.equal(shippingFlags({}, true).canRecordManual, false);
  assert.equal(shippingFlags({ NODE_ENV: 'development' }, true).canRecordManual, false);
  const flags = shippingFlags({ SHIPPING_ENABLED: 'true', SHIPPING_PURCHASE_ENABLED: 'true' }, true);
  assert.equal(flags.canRecordManual, true);
  assert.equal(flags.canQuote, true);
  assert.equal(flags.canPurchase, false);
});

test('read-only mode blocks production defaults and explicit activation', () => {
  for (const enabled of [undefined, 'true']) {
    const flags = shippingFlags({ VERCEL_ENV: 'production', SHIPPING_ENABLED: enabled, SHIPPING_PURCHASE_ENABLED: 'true', READ_ONLY_PREVIEW: 'true' }, true);
    assert.equal(flags.canRecordManual, false);
    assert.equal(flags.canQuote, false);
    assert.equal(flags.canPurchase, false);
  }
});
