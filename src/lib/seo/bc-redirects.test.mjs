import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import nextConfig from '../../../next.config.mjs';
import { bcRedirects } from './bc-redirects.mjs';

const require = createRequire(import.meta.url);
const loadCustomRoutes = require('next/dist/lib/load-custom-routes').default;
const { buildCustomRoute } = require('next/dist/lib/build-custom-route');
const { getPathMatch } = require('next/dist/shared/lib/router/utils/path-match');
const { prepareDestination } = require('next/dist/shared/lib/router/utils/prepare-destination');

// Exercise Next's own compiled routes, including its automatic slash redirects.
const routes = await loadCustomRoutes({ ...nextConfig });
const redirects = routes.redirects.map((route) => buildCustomRoute('redirect', route));
const headers = routes.headers.map((route) => buildCustomRoute('header', route));

function followRedirects(path) {
  let url = new URL(path, 'https://www.lacostagourmet.com');
  const hops = [];
  for (let i = 0; i < 10; i += 1) {
    const route = redirects.find((candidate) => new RegExp(candidate.regex).test(url.pathname));
    if (!route) return { url, hops };
    const params = getPathMatch(route.source, { strict: true })(url.pathname);
    const { parsedDestination } = prepareDestination({
      destination: route.destination,
      params,
      query: Object.fromEntries(url.searchParams),
      appendParamsToQuery: false,
    });
    const query = new URLSearchParams(parsedDestination.query).toString();
    url = new URL(`${parsedDestination.pathname}${query ? `?${query}` : ''}`, url);
    hops.push({ status: route.statusCode, pathname: url.pathname });
  }
  assert.fail(`Redirect loop or excessive chain starting at ${path}`);
}

const correctedPaths = [
  ['/gourmet-sauces-and-syrups/', '/shop/syrups/'],
  ['/frappe-mixes/', '/shop/chai-and-matcha/'],
  ['/cocoa/', '/shop/specialty-beverages/'],
  ['/protein-supplements/', '/shop/protein-and-energy/'],
  ['/brand/island-osis/', '/brand/island-oasis/'],
  ['/brand/oatmilk-2/', '/brand/minor-figures/'],
];

for (const [source, destination] of correctedPaths) {
  test(`${source} reaches its canonical URL in one 301 and preserves query parameters`, () => {
    const result = followRedirects(`${source}?page=2&utm_source=legacy`);
    assert.equal(result.url.pathname, destination);
    assert.deepEqual(result.hops, [{ status: 301, pathname: destination }]);
    assert.equal(result.url.searchParams.get('page'), '2');
    assert.equal(result.url.searchParams.get('utm_source'), 'legacy');
  });

  test(`${source.slice(0, -1)} retains Next's slash normalization before the corrected redirect`, () => {
    const result = followRedirects(source.slice(0, -1));
    assert.equal(result.url.pathname, destination);
    assert.deepEqual(result.hops.map((hop) => hop.status), [308, 301]);
  });
}

test('older aliases use the corrected category destinations', () => {
  for (const [source, destination] of [
    ['/shop/syrups-and-sauces/', '/shop/syrups/'],
    ['/shop/frappes/', '/shop/chai-and-matcha/'],
    ['/frappe-mixes/carb-conscious/', '/shop/chai-and-matcha/'],
    ['/cocoa-powder/', '/shop/specialty-beverages/'],
    ['/shop/cocoa/', '/shop/specialty-beverages/'],
    ['/protein-supplement-powder/', '/shop/protein-and-energy/'],
    ['/shop/protein-and-supplements/', '/shop/protein-and-energy/'],
  ]) {
    assert.equal(followRedirects(source).url.pathname, destination, source);
  }
});

test('legacy mappings have no duplicate sources or cycles through equivalent slash URLs', () => {
  const exactSources = bcRedirects.map((route) => route.source);
  assert.equal(new Set(exactSources).size, exactSources.length);
  const normalize = (path) => path.replace(/\/$/, '');
  const graph = new Map(bcRedirects.map((route) => [normalize(route.source), normalize(route.destination)]));
  for (const source of graph.keys()) {
    const visited = new Set();
    let current = source;
    while (graph.has(current)) {
      assert.equal(visited.has(current), false, `Redirect cycle from ${source}`);
      visited.add(current);
      current = graph.get(current);
    }
  }
});

test('canonical payment callbacks, authentication endpoints and feeds are not redirected', () => {
  for (const pathname of [
    '/api/checkout/hosted-callback/',
    '/api/webhooks/authnet/',
    '/api/checkout/payment-status/',
    '/api/admin/login/',
    '/admin/login/',
    '/auth/callback/',
    '/api/google-feed.xml',
    '/sitemap.xml',
  ]) {
    assert.deepEqual(followRedirects(pathname).hops, [], pathname);
  }
});

test('brand page responses do not inherit static asset cache headers', () => {
  for (const pathname of [
    '/brand/', '/brand/island-oasis/', '/brand/minor-figures/',
    '/brand/island-osis/', '/brand/oatmilk-2/',
  ]) {
    assert.equal(headers.some((route) => new RegExp(route.regex).test(pathname)), false, pathname);
  }
  for (const pathname of ['/brand/logo.png', '/brand/logo-small.png', '/brand/icon.png']) {
    const route = headers.find((candidate) => new RegExp(candidate.regex).test(pathname));
    assert.ok(route, pathname);
    assert.deepEqual(route.headers, [{ key: 'Cache-Control', value: 'public, max-age=3600' }]);
  }
});
