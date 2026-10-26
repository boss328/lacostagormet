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
  pack_parent_id: null, retail_price: 170, stock_status: 'in_stock',
  brands: { name: 'David Rio', slug: 'david-rio' },
  product_images: [{ url: '/four-bags.jpg', alt_text: 'Four bags', is_primary: true, display_order: 0 }],
};
const singleProduct: ProductCardData = {
  ...caseProduct, id: 'single-id', slug: 'elephant-vanilla-one-bag', sku: 'EV4B-1',
  name: 'David Rio Elephant Vanilla Chai — One 4 lb. Bag',
  pack_size: 'One 4 lb. Bag', units_per_pack: 1, pack_parent_id: caseProduct.id, retail_price: 47,
  product_images: [{ url: '/one-bag.jpg', alt_text: 'One bag', is_primary: true, display_order: 0 }],
};

function components() {
  const added: ReturnType<typeof packOptions.productCartItem>[] = [];
  const modules: Record<string, unknown> = {
    react: require('react'),
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/link': { default: ({ children, scroll: _scroll, ...props }: React.PropsWithChildren<Record<string, unknown>>) => React.createElement('a', props, children) },
    './ProductImage': { ProductImage: ({ src, alt }: { src: string; alt: string }) => React.createElement('img', { src, alt }) },
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

function sizeButtons(html: string) {
  return [...html.matchAll(/<button\b[^>]*aria-pressed="(?:true|false)"[^>]*>[\s\S]*?<\/button>/g)]
    .map(match => match[0]);
}

test('grouped card initially displays and adds the selected actual SKU at its own price', () => {
  for (const search of ['', 'EV4B']) {
    const h = components();
    const [product] = groupCatalogPacks([caseProduct, singleProduct], { search });
    const html = renderToStaticMarkup(React.createElement(h.ProductCard, { product }));
    assert.match(html, /1 bag · 4 lb/);
    assert.match(html, /4 bags · 4 lb each/);
    const expected = search ? caseProduct : singleProduct;
    assert.match(html, /Save \$18\.00 vs\. 4 single bags/);
    assert.match(html, new RegExp(`class="type-price">\\$${Number(expected.retail_price).toFixed(2).replace('.', '\\.')}</span>`));
    assert.match(html, new RegExp(`href="/product/${expected.slug}"`));
    assert.match(html, new RegExp(`src="${expected.product_images![0].url}"`));
    const options = sizeButtons(html);
    assert.equal(options.length, 2);
    const selectedOption = options.find(option => option.includes('aria-pressed="true"'))!;
    assert.match(selectedOption, search ? /4 bags · 4 lb each/ : /1 bag · 4 lb/);
    assert.ok(options.every(option => !option.includes('href=')), 'size changes stay on the current page');
    assert.equal(h.added.length, 1);
    assert.deepEqual(h.added[0], packOptions.productCartItem(expected));
    assert.match(html, /<h3>Elephant Vanilla Chai(?: Mix)?<\/h3>/);
    assert.ok(h.added[0].name.startsWith('David Rio'), 'display simplification never changes cart/order names');
  }
});

test('compact card size controls are accessible buttons outside the product link', () => {
  const h = components();
  const [product] = groupCatalogPacks([caseProduct, singleProduct]);
  const html = renderToStaticMarkup(React.createElement(h.ProductCard, { product, compact: true }));
  const anchors = [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map(match => match[0]);
  assert.equal(anchors.length, 1, 'only the main product link navigates');
  assert.ok(anchors.every(anchor => !/<a\b[^>]*>[\s\S]*<(?:a|button)\b/.test(anchor)), 'no nested interactive controls');
  assert.equal(sizeButtons(html).length, 2);
  assert.equal(sizeButtons(html).filter(option => option.includes('aria-pressed="true"')).length, 1);
  assert.match(html, /aria-live="polite" aria-atomic="true">\$47\.00/);
  assert.match(html, /aria-label="Choose size for Elephant Vanilla Chai"/);
  assert.equal(h.added.length, 0);
});

test('detail options mark the selected size without route links and show precise comparisons', () => {
  const h = components();
  const html = renderToStaticMarkup(React.createElement(h.ProductPackOptions, {
    options: [singleProduct, caseProduct], selectedId: caseProduct.id, onSelect: () => undefined,
  }));
  const options = sizeButtons(html);
  assert.equal(options.length, 2);
  assert.match(options[0], /aria-pressed="false"/);
  assert.match(options[1], /aria-pressed="true"/);
  assert.doesNotMatch(html, /<a\b|href=|aria-current=/);
  assert.match(html, /4 bags · 4 lb each/);
  assert.match(options[0], /\$47\.00/);
  assert.match(options[1], /\$170\.00/);
  assert.match(html, /\$42\.50 per bag/);
  assert.match(html, /Save \$18\.00 vs\. 4 single bags/);
});

test('detail size buttons report the selected product ID, not its count or parent ID', () => {
  const h = components();
  const selected: string[] = [];
  const root = (h.ProductPackOptions as (props: Record<string, unknown>) => React.ReactNode)({
    options: [singleProduct, caseProduct], selectedId: caseProduct.id,
    onSelect: (id: string) => selected.push(id),
  });
  const buttons: Array<React.ReactElement<{ onClick: () => void }>> = [];
  function visit(node: React.ReactNode) {
    React.Children.forEach(node, child => {
      if (!React.isValidElement<{ children?: React.ReactNode; onClick: () => void }>(child)) return;
      if (child.type === 'button') buttons.push(child);
      visit(child.props.children);
    });
  }
  visit(root);
  assert.equal(buttons.length, 2);
  buttons[0].props.onClick();
  buttons[1].props.onClick();
  assert.deepEqual(selected, [singleProduct.id, caseProduct.id]);
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
  assert.ok(h.added.every(item => item.product_id === caseProduct.id && item.price === 170));
});

test('cards exclude draft or deleted options even when passed directly by a caller', () => {
  for (const changes of [{ is_active: false }, { deleted_at: '2026-10-26' }]) {
    const h = components();
    const html = renderToStaticMarkup(React.createElement(h.ProductCard, {
      product: { ...caseProduct, pack_options: [caseProduct, { ...singleProduct, ...changes }] },
    }));
    assert.doesNotMatch(html, /Choose size|one-bag|Save \$/);
    assert.equal(h.added.length, 1);
    assert.deepEqual(h.added[0], packOptions.productCartItem(caseProduct));
  }
});

test('an unavailable selected size displays its price without an Add button or savings claim', () => {
  for (const stock_status of ['out_of_stock', 'discontinued', null]) {
    const h = components();
    const unavailable = { ...singleProduct, stock_status };
    const html = renderToStaticMarkup(React.createElement(h.ProductCard, {
      product: { ...unavailable, pack_options: [unavailable, caseProduct] },
    }));
    assert.match(html, /class="type-price">\$47\.00/);
    assert.match(html, /Out of stock/);
    assert.doesNotMatch(html, /data-product-id=|Save \$/);
    assert.equal(h.added.length, 0);
    assert.match(sizeButtons(html)[0], /aria-pressed="true"/);
  }
});

test('legacy products retain their existing price and do not acquire a size selector', () => {
  const h = components();
  const legacy = { ...caseProduct, pack_unit_label: null, retail_price: 19.5 };
  const html = renderToStaticMarkup(React.createElement(h.ProductCard, { product: legacy }));
  assert.match(html, /class="type-price">\$19\.50/);
  assert.doesNotMatch(html, /aria-pressed|Choose size|per bag/);
  assert.deepEqual(h.added, [packOptions.productCartItem(legacy)]);
});
