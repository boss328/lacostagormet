import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shippingFlags } from './flags';

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
  const env = { VERCEL_ENV: 'production', SHIPPING_PURCHASE_ENABLED: 'true' };
  assert.equal(shippingFlags(env).canRecordManual, true);
  assert.equal(shippingFlags(env).canPurchase, false);
  assert.equal(shippingFlags(env, true).canPurchase, true);
  assert.equal(shippingFlags({ ...env, SHIPPING_PURCHASE_ENABLED: 'false' }, true).canPurchase, false);
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
