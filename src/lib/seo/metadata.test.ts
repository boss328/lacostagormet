import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { COLLECTIONS } from '../collections';
import { listingCanonical } from './canonical';
import { brandMetadata, categoryMetadata, pageMetadata, productTitle } from './metadata';

test('product titles do not repeat a brand already leading the product name', () => {
  assert.equal(productTitle('Big Train Raspberry Chai', 'Big Train'), 'Big Train Raspberry Chai');
  assert.equal(productTitle('BIG TRAIN Raspberry Chai', 'Big Train'), 'BIG TRAIN Raspberry Chai');
  assert.equal(productTitle('Big   Train Raspberry Chai', ' Big Train '), 'Big   Train Raspberry Chai');
  assert.equal(productTitle('Big Train® Raspberry Chai', 'Big Train'), 'Big Train® Raspberry Chai');
  assert.equal(productTitle('Big Train™ Raspberry Chai', 'Big Train'), 'Big Train™ Raspberry Chai');
  assert.equal(productTitle('Big Train—Raspberry Chai', 'Big Train'), 'Big Train—Raspberry Chai');
  assert.equal(productTitle('Big Train', 'Big Train'), 'Big Train');
});

test('brand matching respects word boundaries and does not remove product words', () => {
  assert.equal(productTitle('Trainwreck Coffee', 'Train'), 'Train — Trainwreck Coffee');
  assert.equal(productTitle('Caféine Coffee', 'Café'), 'Café — Caféine Coffee');
  assert.equal(productTitle('18830 Syrup', '1883'), '1883 — 18830 Syrup');
  assert.equal(productTitle('Chai by Big Train', 'Big Train'), 'Big Train — Chai by Big Train');
  assert.equal(productTitle('Raspberry Chai', null), 'Raspberry Chai');
  assert.equal(productTitle('Raspberry Chai', ''), 'Raspberry Chai');
});

test('category aliases and canonical categories share their relevant description and image', () => {
  const descriptions = new Set<string>();
  for (const collection of COLLECTIONS) {
    const alias = categoryMetadata(collection.slug, collection.name, `/shop/${collection.slug}/`);
    const canonical = categoryMetadata(collection.source, collection.name, `/shop/${collection.source}/`);
    assert.equal(alias.description, canonical.description);
    assert.deepEqual(alias.openGraph?.images, canonical.openGraph?.images);
    const images = canonical.openGraph?.images as Array<{ url: string; alt: string }>;
    assert.equal(images.length, 1);
    assert.ok(existsSync(resolve('public', images[0].url.slice(1))), `${images[0].url} exists`);
    assert.ok(images[0].alt);
    descriptions.add(String(canonical.description));
  }
  assert.equal(descriptions.size, COLLECTIONS.length, 'each category has its own description');
  const specialty = categoryMetadata('specialty-beverages', 'Specialty Beverages', '/shop/specialty-beverages/');
  assert.equal(specialty.title, 'Specialty Beverages');
  assert.match(String(specialty.description), /specialty beverages/);
});

test('new administrator-managed categories and brands receive specific metadata', () => {
  const category = categoryMetadata('brewing-supplies', 'Brewing Supplies', '/shop/brewing-supplies/');
  assert.match(String(category.description), /Brewing Supplies/);
  const minorFigures = brandMetadata('Minor Figures', '/brand/minor-figures/');
  const tulip = brandMetadata('Tulip by Hollander', '/brand/tulip-by-hollander/');
  assert.match(String(minorFigures.description), /Minor Figures/);
  assert.match(String(tulip.description), /Tulip by Hollander/);
  assert.notEqual(minorFigures.description, tulip.description);
  assert.ok(minorFigures.openGraph?.images);
});

test('search and social previews agree on the page and its pagination canonical', () => {
  const canonical = listingCanonical('/brand/minor-figures', {
    page: '2', sort: 'price-asc', srsltid: 'tracking-token',
  });
  assert.equal(canonical, '/brand/minor-figures/?page=2');
  const image = { url: 'https://cdn.example.com/minor-figures.png', alt: 'Minor Figures oat milk' };
  const metadata = brandMetadata('Minor Figures', canonical, image);
  assert.equal(metadata.alternates?.canonical, canonical);
  assert.equal(metadata.openGraph?.url, canonical);
  assert.equal(metadata.openGraph?.title, metadata.title);
  assert.equal(metadata.openGraph?.description, metadata.description);
  assert.deepEqual(metadata.openGraph?.images, [image]);
  assert.equal(metadata.twitter?.title, metadata.title);
  assert.deepEqual(metadata.twitter?.images, [image]);
});

test('public information pages always have a social image and the correct page URL', () => {
  const metadata = pageMetadata({
    title: 'Returns',
    description: 'Contact us within 30 days to arrange a return.',
    canonical: '/returns/',
  });
  assert.equal(metadata.openGraph?.title, 'Returns');
  assert.equal(metadata.openGraph?.url, '/returns/');
  assert.equal(metadata.alternates?.canonical, '/returns/');
  assert.ok(metadata.openGraph?.images);
  assert.equal(listingCanonical('/shop', { page: '1' }), '/shop/');
  assert.equal(listingCanonical('/shop', { page: 'invalid', q: 'chai' }), '/shop/');
});
