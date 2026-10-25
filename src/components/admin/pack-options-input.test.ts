import assert from 'node:assert/strict';
import test from 'node:test';
import { suggestPackPrice } from './pack-options-input';
import { packUnitPrice } from '@/lib/product-packs';

test('single-pack suggestion adds the chosen premium to the case unit price', () => {
  assert.equal(suggestPackPrice(40, 4, 1, 10), 11);
  assert.equal(suggestPackPrice(39.99, 4, 1, 10), 11);
  assert.equal(suggestPackPrice(72, 6, 2, 5), 25.2);
  assert.equal(suggestPackPrice(40, 4, 1, 0), 10);
});

test('unit comparison divides by units inside the pack, not cart quantity', () => {
  assert.equal(packUnitPrice(40, 4), 10);
  assert.equal(packUnitPrice(11, 1), 11);
});

test('incomplete or invalid inputs never suggest a purchasable price', () => {
  for (const args of [[0, 4, 1, 10], [40, 0, 1, 10], [40, 4, 0, 10], [40, 4, 1.5, 10], [40, 4, 1, -1], [40, 4, 1, Number.NaN]]) {
    assert.equal(suggestPackPrice(args[0], args[1], args[2], args[3]), null);
  }
  assert.equal(packUnitPrice(40, 0), null);
  assert.equal(packUnitPrice(Number.NaN, 4), null);
});
