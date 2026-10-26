import assert from 'node:assert/strict';
import test from 'node:test';
import { packUnitPrice, packSavingsAmount, packSavingsPercent, parsePackConfiguration, parsePackOptionInput } from './product-packs';

const input = {
  sku: 'CHAI-SINGLE', name: 'Chai single bag', slug: 'chai-single-bag', retail_price: 51.96,
  units_per_pack: 1, parent_units_per_pack: 4, pack_unit_label: 'bag', weight_lb: 3.25,
  vendor_id: '11111111-1111-4111-8111-111111111111', description: 'One bag of chai mix.',
};

test('unit prices round only for display and discounts compare total cents', () => {
  assert.equal(packUnitPrice(188.95, 4), 47.24);
  assert.equal(packUnitPrice(189, 4), 47.25);
  assert.equal(packUnitPrice(51.96, 1), 51.96);
  assert.equal(packSavingsPercent(188.95, 4, 51.96), 9);
  assert.equal(packSavingsPercent(189, 4, 47.25), null);
  assert.equal(packSavingsPercent(189.01, 4, 47.25), null);
  assert.equal(packSavingsPercent(1, 3, 0.34), 1, 'rounded per-unit price must not hide real savings');
  for (const units of [null, undefined, 0, -1, 1.5, NaN, Infinity]) assert.equal(packUnitPrice(12, units), null);
  assert.equal(packUnitPrice(Infinity, 4), null);
  assert.equal(packSavingsPercent(10, 4, 0), null);
});

test('new options default to unpublished and unavailable, without inherited images or unsafe fields', () => {
  const parsed = parsePackOptionInput({ ...input, upc: 'case-upc', wholesale_cost: 40, is_featured: true, pack_parent_id: 'other-product' });
  assert.equal(parsed.is_active, false);
  assert.equal(parsed.stock_status, 'out_of_stock');
  assert.equal(parsed.primary_image_url, null);
  assert.equal('upc' in parsed, false);
  assert.equal('wholesale_cost' in parsed, false);
  assert.equal('pack_parent_id' in parsed, false);
  assert.equal('is_featured' in parsed, false);
});

test('dollar savings compare total cents without rounding per-unit prices first', () => {
  assert.equal(packSavingsAmount(188.95, 4, 51.96), 18.89);
  assert.equal(packSavingsAmount(189, 4, 51.98), 18.92);
  assert.equal(packSavingsAmount(1, 3, 0.34), 0.02);
  assert.equal(packSavingsAmount(189, 4, 47.25), null);
  assert.equal(packSavingsAmount(189.01, 4, 47.25), null);
  assert.equal(packSavingsAmount(12, 1, 13), null);
  assert.equal(packSavingsAmount(12, 4, 0), null);
  for (const count of [0, -1, 1.5, NaN, Infinity]) assert.equal(packSavingsAmount(12, count, 4), null);
  assert.equal(packSavingsAmount(NaN, 4, 4), null);
});

test('invalid prices, weights, counts, routing and visibility fail before a write', () => {
  for (const field of ['retail_price', 'weight_lb']) {
    for (const value of [0, -1, null, '51.96', NaN, Infinity, 0.001]) {
      assert.throws(() => parsePackOptionInput({ ...input, [field]: value }));
    }
  }
  for (const value of [0, -1, 1.5, 1001, '1', null]) {
    assert.throws(() => parsePackOptionInput({ ...input, units_per_pack: value }));
  }
  assert.throws(() => parsePackOptionInput({ ...input, vendor_id: null }), /fulfills/);
  assert.throws(() => parsePackOptionInput({ ...input, is_active: 'false' }), /visibility/);
  assert.throws(() => parsePackOptionInput({ ...input, is_active: true }), /image/);
  assert.throws(() => parsePackOptionInput({ ...input, stock_status: 'available' }), /stock/);
  assert.throws(() => parsePackOptionInput({ ...input, slug: '../checkout' }), /slug/);
});

test('same-count formats retain their own label and net contents without changing the original package', () => {
  const parsed = parsePackOptionInput({
    ...input, units_per_pack: 1, parent_units_per_pack: 1,
    parent_pack_unit_label: ' Bag ', pack_unit_label: ' Can ', pack_size: ' 1 × 14 oz can ',
  });
  assert.equal(parsed.parent_pack_unit_label, 'bag');
  assert.equal(parsed.pack_unit_label, 'can');
  assert.equal(parsed.pack_size, '1 × 14 oz can');
  assert.equal(parsed.units_per_pack, 1);
  const legacy = parsePackOptionInput(input);
  assert.equal('pack_size' in legacy, false, 'omitted net contents must not be invented');
  assert.equal('parent_pack_unit_label' in legacy, false);
  assert.equal(parsePackOptionInput({ ...input, pack_size: null }).pack_size, null);
  for (const value of ['', ' '.repeat(4), 14, {}, 'x'.repeat(201)]) {
    assert.throws(() => parsePackOptionInput({ ...input, pack_size: value }), /Net contents/);
  }
  for (const value of [null, '', '<img>', 'x'.repeat(31)]) {
    assert.throws(() => parsePackOptionInput({ ...input, parent_pack_unit_label: value }));
  }
});

test('pack configuration normalizes labels without accepting markup or ambiguous counts', () => {
  assert.deepEqual(parsePackConfiguration({ units_per_pack: 4, pack_unit_label: ' Bag ' }), { units_per_pack: 4, pack_unit_label: 'bag' });
  assert.throws(() => parsePackConfiguration({ units_per_pack: 4.5, pack_unit_label: 'bag' }));
  assert.throws(() => parsePackConfiguration({ units_per_pack: 4, pack_unit_label: '<img>' }));
  assert.throws(() => parsePackConfiguration([]));
});
