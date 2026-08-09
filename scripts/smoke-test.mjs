#!/usr/bin/env node
/**
 * scripts/smoke-test.mjs — production smoke test for the redirect failure class.
 *
 * WHY THIS EXISTS (do not delete as cruft):
 * next.config sets `trailingSlash: true`, which 308-redirects any
 * extension-less route addressed without its slash. External services do
 * not follow redirects, and this exact mechanism has broken production
 * repeatedly — worst on Apr–Aug 2026, when Authorize.net's payment
 * callback POST hit a silent 308 for four months: no order was ever
 * marked paid, no confirmation email ever sent (see
 * src/lib/checkout/finalize-payment.ts and the warning above
 * trailingSlash in next.config.mjs). The sitemap shipped slash-less URLs
 * to the same effect: every entry redirected, 0 pages indexed.
 *
 * This script asserts the externally-consumed endpoints actually reach
 * their handlers (no 3xx at the edge) and that sitemap URLs match the
 * trailing-slash canonicals. Run after ANY deploy touching routes:
 *
 *   npm run smoke
 *
 * Plain Node (>=18 for global fetch), no dependencies.
 *
 * Notes on expectations:
 *  - The hosted-callback endpoint legitimately answers 303 → /checkout
 *    when it runs (it redirects customers by design). That one signature
 *    counts as "handler reached"; any other 3xx — above all a 308 back
 *    to the same path — is the incident recurring and fails the run.
 *  - Probing the callback writes one payment_audit_log row tagged
 *    SMOKE-TEST (its no-silent-paths design logs every arrival); probing
 *    the webhook once AUTHNET_SIGNATURE_KEY is live writes one
 *    'signature header missing' row. Both are self-labelling noise.
 */

const SITE = 'https://www.lacostagourmet.com';

const CRITICAL_ENDPOINTS = [
  {
    name: 'POST /api/checkout/hosted-callback/',
    method: 'POST',
    url: `${SITE}/api/checkout/hosted-callback/?orderNumber=SMOKE-TEST`,
    validate(status, headers) {
      if (status >= 300 && status < 400) {
        const loc = headers.get('location') ?? '';
        if (status === 303 && loc.includes('/checkout')) {
          return { ok: true, note: `303 → ${loc} (handler executed)` };
        }
        return { ok: false, note: `${status} → ${loc || '(no Location)'} — redirected at the edge, handler never ran` };
      }
      if (status >= 500) return { ok: false, note: `${status} — handler crashed` };
      return { ok: true, note: `${status} (handler reached)` };
    },
  },
  {
    name: 'POST /api/webhooks/authnet/',
    method: 'POST',
    url: `${SITE}/api/webhooks/authnet/`,
    body: '{"smoke":true}',
    validate(status) {
      if (status === 503) return { ok: true, note: '503 (fail-closed: AUTHNET_SIGNATURE_KEY not configured)' };
      if (status === 401) return { ok: true, note: '401 (signature enforcement live)' };
      if (status >= 300 && status < 400) {
        return { ok: false, note: `${status} — redirected at the edge, handler never ran` };
      }
      if (status === 404) return { ok: false, note: '404 — webhook route missing' };
      return { ok: false, note: `${status} — expected 503 (pre-config) or 401 (post-config)` };
    },
  },
  {
    name: 'GET  /api/google-feed.xml',
    method: 'GET',
    url: `${SITE}/api/google-feed.xml`,
    validate(status) {
      return status === 200
        ? { ok: true, note: '200' }
        : { ok: false, note: `${status} — Merchant Center feed must answer 200 directly` };
    },
  },
  {
    name: 'GET  /sitemap.xml',
    method: 'GET',
    url: `${SITE}/sitemap.xml`,
    async validateBody(status, body) {
      if (status !== 200) return { ok: false, note: `${status} — sitemap must answer 200` };
      const firstLoc = body.match(/<loc>([^<]+)<\/loc>/)?.[1];
      if (!firstLoc) return { ok: false, note: '200 but no <loc> entries found' };
      if (!firstLoc.endsWith('/')) {
        return { ok: false, note: `first <loc> lacks trailing slash: ${firstLoc}` };
      }
      return { ok: true, note: `200, first <loc> ${firstLoc}` };
    },
  },
  {
    name: 'GET  /robots.txt',
    method: 'GET',
    url: `${SITE}/robots.txt`,
    validate(status) {
      return status === 200
        ? { ok: true, note: '200' }
        : { ok: false, note: `${status} — robots.txt must answer 200` };
    },
  },
];

/** Last path segment contains a dot → looks like a file, exempt from the slash rule. */
function lastSegmentHasDot(url) {
  try {
    const { pathname } = new URL(url);
    const last = pathname.split('/').filter(Boolean).pop() ?? '';
    return last.includes('.');
  } catch {
    return false;
  }
}

async function main() {
  const failures = [];
  let sitemapBody = null;

  for (const ep of CRITICAL_ENDPOINTS) {
    let result;
    try {
      const res = await fetch(ep.url, {
        method: ep.method,
        redirect: 'manual',
        ...(ep.body ? { body: ep.body, headers: { 'content-type': 'application/json' } } : {}),
      });
      if (ep.validateBody) {
        const body = await res.text();
        if (ep.url.endsWith('/sitemap.xml')) sitemapBody = body;
        result = await ep.validateBody(res.status, body);
      } else {
        result = ep.validate(res.status, res.headers);
      }
    } catch (e) {
      result = { ok: false, note: `request failed: ${e.message}` };
    }
    console.log(`${result.ok ? 'ok  ' : 'FAIL'}  ${ep.name} → ${result.note}`);
    if (!result.ok) failures.push({ url: ep.url, note: result.note });
  }

  // Full sitemap scan: every <loc> must end in / unless it looks like a file.
  if (sitemapBody) {
    const locs = [...sitemapBody.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const offenders = locs.filter((u) => !u.endsWith('/') && !lastSegmentHasDot(u));
    if (offenders.length) {
      console.log(`FAIL  sitemap slash scan → ${offenders.length}/${locs.length} <loc> without trailing slash (first: ${offenders[0]})`);
      failures.push({ url: offenders[0], note: 'sitemap <loc> without trailing slash — every entry will redirect' });
    } else {
      console.log(`ok    sitemap slash scan → ${locs.length}/${locs.length} <loc> entries carry the trailing slash`);
    }
  }

  if (failures.length) {
    console.error('\nSMOKE TEST FAILED:');
    for (const f of failures) console.error(`  ${f.url}\n    ${f.note}`);
    process.exit(1);
  }
  console.log('\nAll smoke checks passed.');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
