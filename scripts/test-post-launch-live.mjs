#!/usr/bin/env node
/**
 * Read-only checks for the October 2026 post-launch corrections.
 * Run after deployment: node scripts/test-post-launch-live.mjs
 * Override SITE for local/preview checks; CANONICAL_SITE defaults to production.
 * All requests are GETs with at most four concurrent requests. No account,
 * checkout, provider or mutation endpoints are called.
 */
import assert from 'node:assert/strict';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

const SITE = new URL(process.env.SITE || process.argv[2] || 'https://www.lacostagourmet.com').origin;
const CANONICAL_SITE = new URL(process.env.CANONICAL_SITE || 'https://www.lacostagourmet.com').origin;
const failures = [];
let passed = 0;
const pageResults = new Map();
const imageUrls = new Set();

async function parallel(items, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift());
  }));
}

async function check(label, fn) {
  try {
    await fn();
    passed += 1;
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
  }
}

async function request(path, { image = false } = {}) {
  const url = new URL(path, SITE);
  // A preview's metadata should still advertise production canonicals, but
  // its own assets should be checked on the preview under test.
  if (image && url.origin === CANONICAL_SITE && SITE !== CANONICAL_SITE) {
    url.host = new URL(SITE).host;
    url.protocol = new URL(SITE).protocol;
  }
  return fetch(url, {
    redirect: image ? 'follow' : 'manual',
    signal: AbortSignal.timeout(30_000),
    headers: { 'User-Agent': 'LaCostaPostLaunchAudit/1.0' },
  });
}

function decode(value) {
  const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (raw, entity) => {
    if (entity.startsWith('#')) {
      return String.fromCodePoint(entity[1].toLowerCase() === 'x'
        ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10));
    }
    return entities[entity.toLowerCase()] ?? raw;
  }).trim();
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
    .map((match) => [match[1].toLowerCase(), decode(match[2] ?? match[3])]));
}

function parseMetadata(html) {
  const meta = new Map();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    const key = (attrs.name || attrs.property || '').toLowerCase();
    if (key) meta.set(key, [...(meta.get(key) ?? []), attrs.content ?? '']);
  }
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => attributes(match[0]));
  return {
    title: decode(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''),
    meta,
    canonical: links.filter((link) => link.rel === 'canonical').map((link) => link.href),
  };
}

async function auditPage(path) {
  const response = await request(path);
  assert.equal(response.status, 200, `expected 200, got ${response.status}`);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/);
  const parsed = parseMetadata(await response.text());
  assert.ok(parsed.title, 'missing title');
  for (const key of ['description', 'og:title', 'og:image']) {
    const values = parsed.meta.get(key) ?? [];
    assert.ok(values.length && values.every(Boolean), `missing or empty ${key}`);
    if (key !== 'og:image') assert.equal(values.length, 1, `duplicate ${key}`);
  }
  assert.equal(parsed.canonical.length, 1, 'expected one canonical link');
  assert.equal(parsed.canonical[0], new URL(path, CANONICAL_SITE).href, 'incorrect canonical');
  for (const url of parsed.meta.get('og:image')) {
    assert.match(url, /^https?:\/\//, 'og:image must be an absolute URL');
    imageUrls.add(url);
  }
  if (path.startsWith('/brand/')) {
    assert.doesNotMatch(response.headers.get('cache-control') ?? '', /immutable|max-age=31536000/,
      'brand page received static asset cache policy');
  }
  pageResults.set(path, parsed);
  return parsed;
}

const redirects = [
  ['/gourmet-sauces-and-syrups/', '/shop/syrups/'],
  ['/frappe-mixes/', '/shop/chai-and-matcha/'],
  ['/cocoa/', '/shop/specialty-beverages/'],
  ['/protein-supplements/', '/shop/protein-and-energy/'],
  ['/brand/island-osis/', '/brand/island-oasis/'],
  ['/brand/oatmilk-2/', '/brand/minor-figures/'],
];

await parallel(redirects, ([source, destination]) => check(`redirect ${source}`, async () => {
  const response = await request(source);
  await response.body?.cancel();
  assert.equal(response.status, 301, `expected 301, got ${response.status}`);
  const location = response.headers.get('location');
  assert.ok(location, 'missing Location');
  assert.equal(new URL(location, SITE).href, new URL(destination, SITE).href, 'incorrect destination');
}));

const landingPages = [
  '/', '/shop/', '/brand/',
  ...[
    'syrups', 'chai-and-matcha', 'specialty-beverages', 'protein-and-energy',
    'smoothies', 'oatmeal', 'boba', 'coffee-tea', 'plant-based-milks',
  ].map((slug) => `/shop/${slug}/`),
  '/brand/minor-figures/', '/brand/island-oasis/', '/brand/tulip-by-hollander/',
  '/contact/', '/for-business/', '/shipping/', '/returns/', '/privacy/', '/terms/',
];
await parallel(landingPages, (path) => check(`metadata ${path}`, () => auditPage(path)));

await check('distinct page descriptions and corrected names', async () => {
  const descriptions = new Map();
  for (const [path, page] of pageResults) {
    const description = page.meta.get('description')[0];
    assert.ok(!descriptions.has(description), `${path} reuses description from ${descriptions.get(description)}`);
    descriptions.set(description, path);
  }
  for (const [path, expected] of [
    ['/shop/specialty-beverages/', 'Specialty Beverages'],
    ['/brand/minor-figures/', 'Minor Figures'],
    ['/brand/island-oasis/', 'Island Oasis'],
    ['/brand/tulip-by-hollander/', 'Tulip by Hollander'],
  ]) {
    const page = pageResults.get(path);
    assert.ok(page, `${path} metadata was not verified`);
    assert.ok(page.title.startsWith(expected), `${path} has incorrect title: ${page.title}`);
    assert.ok(page.meta.get('og:title')[0].startsWith(expected), `${path} has incorrect og:title`);
  }
});

let feedItems = [];
await check('Merchant Center feed and manufacturer corrections', async () => {
  const response = await request('/api/google-feed.xml');
  assert.equal(response.status, 200, `expected 200, got ${response.status}`);
  const xml = await response.text();
  assert.equal(XMLValidator.validate(xml), true, 'feed is not well-formed XML');
  const parser = new XMLParser({ parseTagValue: false, isArray: (_name, path) => path === 'rss.channel.item' });
  feedItems = parser.parse(xml)?.rss?.channel?.item ?? [];
  assert.ok(feedItems.length > 0, 'feed has no products');
  assert.equal(new Set(feedItems.map((item) => item['g:id'])).size, feedItems.length, 'duplicate feed IDs');
  for (const item of feedItems) {
    assert.doesNotMatch(item['g:brand'] ?? '', /^oat\s*milk$/i, `obsolete brand on SKU ${item['g:id']}`);
    assert.ok(['in_stock', 'out_of_stock', 'preorder', 'backorder'].includes(item['g:availability']),
      `invalid availability on SKU ${item['g:id']}`);
  }
  for (const [sku, brand] of [
    ['USMK-02032006', 'Minor Figures'], ['USMK-01032006', 'Minor Figures'],
    ['00661', 'Tulip by Hollander'], ['00660', 'Tulip by Hollander'],
  ]) {
    const item = feedItems.find((row) => row['g:id'] === sku);
    assert.ok(item, `missing corrected product SKU ${sku}`);
    assert.equal(item['g:brand'], brand, `incorrect manufacturer for SKU ${sku}`);
  }
});

await check('Big Train product title does not repeat its brand', async () => {
  const item = feedItems.find((row) => row['g:brand'] === 'Big Train' && /^Big Train\b/i.test(row['g:title']));
  assert.ok(item, 'no Big Train product available for title verification');
  const path = new URL(item['g:link']).pathname;
  const page = await auditPage(path);
  for (const title of [page.title, page.meta.get('og:title')[0]]) {
    assert.match(title, /^Big Train\b/i);
    assert.equal((title.match(/\bBig Train\b/gi) ?? []).length, 1, `brand repeated in title: ${title}`);
  }
});

await parallel(imageUrls, (url) => check(`social image ${new URL(url).pathname}`, async () => {
  const response = await request(url, { image: true });
  await response.body?.cancel();
  assert.equal(response.status, 200, `expected 200, got ${response.status}`);
  assert.match(response.headers.get('content-type') ?? '', /^image\//, 'URL is not an image');
}));

const availability = {};
for (const item of feedItems) availability[item['g:availability']] = (availability[item['g:availability']] ?? 0) + 1;
console.log(`Post-launch audit: ${SITE}`);
console.log(`${passed} checks passed; ${failures.length} failed. ${pageResults.size} pages, ${imageUrls.size} social images, ${feedItems.length} feed products.`);
console.log(`Feed availability (reported values, not proof of external inventory sync): ${JSON.stringify(availability)}`);
for (const failure of failures) console.error(`FAIL ${failure}`);
if (failures.length) process.exitCode = 1;
