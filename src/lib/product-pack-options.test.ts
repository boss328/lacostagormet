import assert from 'node:assert/strict';
import test from 'node:test';
import { getPackPricing, productCartItem, productPackOptions, type PackProduct } from './product-pack-options';

const fourPack: PackProduct = {
  id: 'case-id',
  slug: 'tiger-spice-four-pack',
  sku: 'DR-TIGER-4',
  name: 'Tiger Spice Chai · Four bags',
  retail_price: '96.00',
  pack_size: 'Four 4 lb. Bags',
  units_per_pack: 4,
  pack_parent_id: null,
  pack_unit_label: 'bag',
  stock_status: 'in_stock',
  brands: { name: 'David Rio', slug: 'david-rio' },
  product_images: [{ url: '/test-four.jpg', alt_text: 'Four bags', is_primary: true, display_order: 1 }],
};
const single: PackProduct = {
  ...fourPack,
  id: 'single-id',
  slug: 'tiger-spice-one-pack',
  sku: 'DR-TIGER-1',
  name: 'Tiger Spice Chai · One bag',
  retail_price: '27.00',
  pack_size: 'One 4 lb. Bag',
  units_per_pack: 1,
  pack_parent_id: fourPack.id,
  product_images: [{ url: '/test-one.jpg', alt_text: 'One bag', is_primary: true, display_order: 1 }],
};

test('a single and its four-pack resolve the same family in count order', () => {
  const unrelated = { ...single, id: 'other-single', pack_parent_id: 'another-product' };
  assert.deepEqual(productPackOptions(single, [fourPack, unrelated, single]).map((product) => product.id), ['single-id', 'case-id']);
  assert.deepEqual(productPackOptions(fourPack, [single, unrelated, fourPack]).map((product) => product.id), ['single-id', 'case-id']);
});

test('each pack keeps its own SKU, total price, image and identity in the cart', () => {
  const one = productCartItem(single);
  const four = productCartItem(fourPack);
  assert.deepEqual([one.product_id, one.sku, one.slug, one.price, one.image_url, one.units_per_pack], ['single-id', 'DR-TIGER-1', 'tiger-spice-one-pack', 27, '/test-one.jpg', 1]);
  assert.deepEqual([four.product_id, four.sku, four.slug, four.price, four.image_url, four.units_per_pack], ['case-id', 'DR-TIGER-4', 'tiger-spice-four-pack', 96, '/test-four.jpg', 4]);
  assert.equal(one.price + four.price, 123);
  assert.equal(getPackPricing(single)?.unitPrice, 27);
  assert.equal(getPackPricing(fourPack)?.unitPrice, 24);
});

test('existing products do not gain pack merchandising from count alone', () => {
  const legacy = { ...fourPack, pack_unit_label: null };
  assert.equal(getPackPricing(legacy), null);
  assert.equal(productCartItem(legacy).units_per_pack, undefined);
  assert.deepEqual(productPackOptions(legacy, [legacy]), []);
});

test('invalid counts and prices cannot produce a misleading unit price', () => {
  for (const units_per_pack of [0, -1, 1.5, NaN, null]) {
    assert.equal(getPackPricing({ ...fourPack, units_per_pack }), null);
  }
  assert.equal(getPackPricing({ ...fourPack, retail_price: 'invalid' }), null);
});

test('cart image selection follows primary then display order without changing the source', () => {
  const images = [
    { url: '/second.jpg', alt_text: null, is_primary: false, display_order: 2 },
    { url: '/first.jpg', alt_text: null, is_primary: false, display_order: 1 },
  ];
  assert.equal(productCartItem({ ...single, product_images: images }).image_url, '/first.jpg');
  assert.equal(images[0].url, '/second.jpg');
  assert.equal(productCartItem({ ...single, product_images: [...images, { ...images[0], url: '/primary.jpg', is_primary: true }] }).image_url, '/primary.jpg');
});
