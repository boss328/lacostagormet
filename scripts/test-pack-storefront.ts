import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as packOptions from '../src/lib/product-pack-options';
import * as availability from '../src/lib/product-availability';
import { groupCatalogPacks } from '../src/lib/catalog-pack-groups';
import type { ProductCardData } from '../src/components/shop/ProductCard';

const require = createRequire(import.meta.url);
const caseProduct: ProductCardData = {
  id: 'case-id', slug: 'elephant-vanilla-four-bags', sku: 'EV4B',
  name: 'David Rio Elephant Vanilla Chai Mix, 4 lb Foodservice Bag (Case of 4) - ~65 Servings per Bag',
  pack_size: 'Four 4 lb. Bags', units_per_pack: 4, pack_unit_label: 'bag',
  pack_parent_id: null, retail_price: 188.95, stock_status: 'in_stock',
  brands: { name: 'David Rio', slug: 'david-rio' },
};
const singleProduct: ProductCardData = {
  ...caseProduct, id: 'single-id', slug: 'elephant-vanilla-one-bag', sku: 'EV4B-1',
  name: 'David Rio Elephant Vanilla Chai — One 4 lb. Bag',
  pack_size: 'One 4 lb. Bag', units_per_pack: 1, pack_parent_id: caseProduct.id, retail_price: 51.96,
};

function components() {
  const added: ReturnType<typeof packOptions.productCartItem>[] = [];
  const modules: Record<string, unknown> = {
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/link': { default: ({ children, scroll: _scroll, ...props }: React.PropsWithChildren<Record<string, unknown>>) => React.createElement('a', props, children) },
    './ProductImage': { ProductImage: () => null },
    './ProductCardAdd': { ProductCardAdd: ({ item }: { item: ReturnType<typeof packOptions.productCartItem> }) => {
      added.push(item);
      return React.createElement('button', { 'data-product-id': item.product_id }, 'Add');
    } },
    '@/lib/bcImage': { bcImage: (url: string) => url },
    '@/lib/pack-size': { formatPackSize: (pack: string | null) => pack },
    '@/lib/product-availability': availability,
    '@/lib/product-pack-options': packOptions,
  };
  function evaluate(filename: string) {
    const compiled = ts.transpileModule(readFileSync(new URL(filename, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const target = { exports: {} as Record<string, React.ComponentType<any>> };
    new Function('require', 'module', 'exports', compiled)((name: string) => {
      if (!(name in modules)) throw new Error(`Unmocked UI boundary: ${name}`);
      return modules[name];
    }, target, target.exports);
    return target.exports;
  }
  return {
    added,
    ProductCard: evaluate('../src/components/shop/ProductCard.tsx').ProductCard,
    ProductPackOptions: evaluate('../src/components/shop/ProductPackOptions.tsx').ProductPackOptions,
  };
}

test('grouped card displays both real size links and adds only its displayed SKU and total', () => {
  for (const search of ['', 'EV4B']) {
    const h = components();
    const [product] = groupCatalogPacks([caseProduct, singleProduct], { search });
    const html = renderToStaticMarkup(React.createElement(h.ProductCard, { product }));
    assert.match(html, /1 bag · 4 lb/);
    assert.match(html, /4 bags · 4 lb each/);
    assert.match(html, /Save \$18\.89 vs\. 4 single bags/);
    assert.match(html, /href="\/product\/elephant-vanilla-one-bag\/"/);
    assert.match(html, /href="\/product\/elephant-vanilla-four-bags\/"/);
    assert.equal(h.added.length, 1);
    assert.deepEqual(h.added[0], packOptions.productCartItem(search ? caseProduct : singleProduct));
    assert.match(html, /<h3>Elephant Vanilla Chai(?: Mix)?<\/h3>/);
    assert.ok(h.added[0].name.startsWith('David Rio'), 'display simplification never changes cart/order names');
  }
});

test('compact card size links are independent accessible anchors without nesting', () => {
  const h = components();
  const [product] = groupCatalogPacks([caseProduct, singleProduct]);
  const html = renderToStaticMarkup(React.createElement(h.ProductCard, { product, compact: true }));
  const anchors = [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map(match => match[0]);
  assert.equal(anchors.length, 3, 'main product link plus two size links');
  assert.ok(anchors.every(anchor => (anchor.match(/<a\b/g) ?? []).length === 1), 'no nested interactive links');
  assert.match(html, /aria-label="Choose size for Elephant Vanilla Chai"/);
  assert.equal(h.added.length, 0);
});

test('detail options mark the selected actual route and show precise comparisons', () => {
  const h = components();
  const html = renderToStaticMarkup(React.createElement(h.ProductPackOptions, {
    options: [singleProduct, caseProduct], selectedId: caseProduct.id,
  }));
  assert.match(html, /href="\/product\/elephant-vanilla-four-bags\/"[^>]*aria-current="page"/);
  assert.doesNotMatch(html, /href="\/product\/elephant-vanilla-one-bag\/"[^>]*aria-current/);
  assert.match(html, /4 bags · 4 lb each/);
  assert.match(html, /\$47\.24 per bag/);
  assert.match(html, /Save \$18\.89 vs\. 4 single bags/);
});

test('draft sizes and unavailable single comparisons do not leak into cards', () => {
  const h = components();
  const [withDraft] = groupCatalogPacks([caseProduct, { ...singleProduct, is_active: false }]);
  const draftHtml = renderToStaticMarkup(React.createElement(h.ProductCard, { product: withDraft }));
  assert.doesNotMatch(draftHtml, /elephant-vanilla-one-bag|Choose size|Save \$/);
  const [withUnavailable] = groupCatalogPacks([caseProduct, { ...singleProduct, stock_status: 'out_of_stock' }]);
  const unavailableHtml = renderToStaticMarkup(React.createElement(h.ProductCard, { product: withUnavailable }));
  assert.match(unavailableHtml, /Out of stock/);
  assert.doesNotMatch(unavailableHtml, /Save \$/);
  assert.ok(h.added.every(item => item.product_id === caseProduct.id && item.price === 188.95));
});
