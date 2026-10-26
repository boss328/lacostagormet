import assert from 'node:assert/strict';
import test from 'node:test';
import { getPackPricing, packSavingsForOption, packUnitSize, productCartItem, productDisplayName, productPackOptions, type PackProduct } from './product-pack-options';

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

test('pack size describes actual net contents for case and single packaging', () => {
  for (const pack_size of ['Four 4 lb. Bags', '4 × 4 lb', '4x4lb', '4 4 lbs bags']) {
    assert.equal(getPackPricing({ ...fourPack, pack_size })?.sizeLabel, '4 bags · 4 lb each');
  }
  for (const pack_size of ['Four 3 lb. Bags', '4 × 3 lb', 'Four 3Lb. Bags']) {
    assert.equal(getPackPricing({ ...fourPack, pack_size })?.sizeLabel, '4 bags · 3 lb each');
  }
  assert.equal(getPackPricing(single)?.sizeLabel, '1 bag · 4 lb');
  assert.equal(getPackPricing({ ...single, pack_size: 'One 3 lb. Bag' })?.sizeLabel, '1 bag · 3 lb');
  for (const ounces of [12, 16, 32]) {
    assert.equal(packUnitSize(`${ounces} oz bottle`, 1), `${ounces} oz`, 'a single weight must not split into count and smaller weight');
  }
  assert.equal(packUnitSize('12 × 16 oz bottles', 12), '16 oz');
  assert.equal(packUnitSize('6 32 fl oz bottles', 6), '32 fl oz');
  assert.equal(getPackPricing({ ...fourPack, units_per_pack: 6, pack_unit_label: 'bottle', pack_size: '6 × 32 fl oz bottles' })?.sizeLabel, '6 bottles · 32 fl oz each');
  assert.equal(getPackPricing({ ...fourPack, pack_unit_label: 'box', pack_size: null })?.sizeLabel, '4 boxes');
});

test('unclear packaging falls back to count without inferring net contents from shipping weight', () => {
  for (const pack_size of [null, '', 'Foodservice case', '16 lb total', 'Four 0 lb. Bags', 'Three 4 lb. Bags', '16 lb']) {
    const product = { ...fourPack, pack_size, weight_lb: 17 };
    assert.equal(getPackPricing(product)?.sizeLabel, '4 bags');
    assert.equal(getPackPricing(product)?.unitSize, null);
  }
  assert.equal(packUnitSize('Four 4 lb. Bags', 1), null);
});

test('size buttons identify bags and cans without inferring missing net contents', () => {
  assert.equal(getPackPricing(single)?.selectionLabel, '4 lb bag');
  assert.equal(getPackPricing(fourPack)?.selectionLabel, '4 × 4 lb bags');
  assert.equal(getPackPricing({ ...single, pack_unit_label: 'can', pack_size: '14 oz can' })?.selectionLabel, '14 oz can');
  assert.equal(getPackPricing({ ...single, units_per_pack: 6, pack_unit_label: 'can', pack_size: '6 × 14 oz cans' })?.selectionLabel, '6 × 14 oz cans');
  assert.equal(getPackPricing({ ...single, pack_unit_label: 'can', pack_size: null })?.selectionLabel, '1 can');
  assert.equal(getPackPricing({ ...fourPack, pack_size: 'Three 4 lb. Bags' })?.selectionLabel, '4 bags');
});

test('a mixed-format family keeps each can and bag identity through cart selection', () => {
  const can: PackProduct = {
    ...single, id: 'can-id', sku: 'DR-TIGER-CAN', slug: 'tiger-spice-can', name: 'Tiger Spice Chai · 14 oz Can',
    pack_unit_label: 'can', pack_size: '14 oz can', retail_price: 15,
    product_images: [{ url: '/test-can.jpg', alt_text: 'One can', is_primary: true, display_order: 1 }],
  };
  const options = productPackOptions(can, [fourPack, single, can]);
  assert.deepEqual(new Set(options.map(product => product.id)), new Set(['case-id', 'single-id', 'can-id']));
  const item = productCartItem(can);
  assert.deepEqual([item.product_id, item.sku, item.price, item.image_url, item.units_per_pack, item.pack_unit_label], ['can-id', 'DR-TIGER-CAN', 15, '/test-can.jpg', 1, 'can']);
  assert.equal(productDisplayName(can), 'Tiger Spice Chai');
});

test('visible configured pack names preserve flavors and dietary claims while omitting repeated packaging', () => {
  const cases: [string, string][] = [
    ['David Rio Elephant Vanilla Chai Mix, 4 lb Foodservice Bag (Case of 4) - ~65 Servings per Bag', 'Elephant Vanilla Chai Mix'],
    ['David Rio Tiger Spice Chai Mix, 4 lb Foodservice Bag (Case of 4) - ~65 Servings per Bag', 'Tiger Spice Chai Mix'],
    ['David Rio Power Chai Matcha, 3 lb Bag (Case of 4) - Sweetened Matcha Base', 'Power Chai Matcha · Sweetened Matcha Base'],
    ['David Rio Orca Spice Sugar-Free Chai Mix, 3 lb Bag (Case of 4) - Sugar-Free Chai', 'Orca Spice Sugar-Free Chai Mix'],
    ['David Rio Flamingo Vanilla Decaffeinated Sugar-Free Chai Mix, 3 lb Bag (Case of 4) - Sugar-Free Chai', 'Flamingo Vanilla Decaffeinated Sugar-Free Chai Mix'],
    ['David Rio Elephant Vanilla Chai — One 4 lb. Bag', 'Elephant Vanilla Chai'],
    ['David Rio Flamingo Vanilla Decaffeinated Sugar-Free Chai — One 3 lb. Bag', 'Flamingo Vanilla Decaffeinated Sugar-Free Chai'],
    ['David Rio Orca Spice Sugar-Free Chai — One 3 lb. Bag', 'Orca Spice Sugar-Free Chai'],
    ['David Rio Power Chai Matcha — One 3 lb. Bag', 'Power Chai Matcha'],
    ['David Rio Tiger Spice Chai — One 4 lb. Bag', 'Tiger Spice Chai'],
  ];
  for (const [name, expected] of cases) {
    const product = { ...fourPack, name };
    assert.equal(productDisplayName(product, 'David Rio'), expected);
    assert.equal(product.name, name, 'full catalog name stays intact');
    assert.equal(productCartItem(product).name, name, 'orders retain full catalog name');
  }
  assert.equal(productDisplayName({ ...fourPack, name: 'David Riordan Black Tea Bags' }, 'David Rio'), 'David Riordan Black Tea Bags');
  assert.equal(productDisplayName({ ...fourPack, name: 'Black Tea Bags' }), 'Black Tea Bags');
  const legacy = { ...fourPack, pack_unit_label: null, name: cases[0][0] };
  assert.equal(productDisplayName(legacy, 'David Rio'), legacy.name);
});

test('savings compare purchasable public singles with matching units and net contents', () => {
  const fullCase = { ...fourPack, retail_price: 188.95 };
  const oneBag = { ...single, retail_price: 51.96, is_active: true };
  assert.equal(packSavingsForOption(fullCase, [fullCase, oneBag]), 18.89);
  assert.equal(packSavingsForOption(oneBag, [fullCase, oneBag]), null);
  for (const changes of [
    { is_active: false }, { deleted_at: '2026-01-01' }, { stock_status: 'out_of_stock' },
    { pack_unit_label: 'bottle' }, { pack_size: 'One 3 lb. Bag' }, { pack_size: null },
    { pack_parent_id: 'unrelated-family' }, { retail_price: 'invalid' }, { retail_price: 47 },
  ]) {
    assert.equal(packSavingsForOption(fullCase, [fullCase, { ...oneBag, ...changes }]), null);
  }
  assert.equal(packSavingsForOption(fullCase, [fullCase]), null);
  assert.equal(packSavingsForOption({ ...fullCase, pack_size: null }, [fullCase, oneBag]), null);
});

test('mixed-format savings find the matching single regardless of option order', () => {
  const can: PackProduct = { ...single, id: 'can-id', pack_unit_label: 'can', pack_size: '14 oz can', retail_price: 15 };
  const canCase: PackProduct = { ...fourPack, id: 'can-case-id', pack_parent_id: fourPack.id, units_per_pack: 6, pack_unit_label: 'can', pack_size: '6 × 14 oz cans', retail_price: 80 };
  const smallerBag: PackProduct = { ...single, id: 'smaller-bag-id', pack_size: 'One 3 lb. Bag', retail_price: 20 };
  for (const options of [[single, can, smallerBag], [can, smallerBag, single], [smallerBag, single, can]]) {
    assert.equal(packSavingsForOption(fourPack, options), 12);
    assert.equal(packSavingsForOption(canCase, options), 10);
  }
  assert.equal(packSavingsForOption(fourPack, [can, smallerBag]), null, 'can and smaller bag prices cannot establish bag savings');
  assert.equal(packSavingsForOption(canCase, [single, smallerBag]), null, 'bag prices cannot establish can savings');
});
