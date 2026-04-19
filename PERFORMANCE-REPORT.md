# Phase 7 — performance pass

**Branch:** `phase-7-performance` (5 commits, off `main` at `bc85092`)
**Date:** 2026-04-19
**Scope:** Bundle size, image optimization, caching headers, font weights. Zero feature changes.

## Headline numbers

| Metric                                    | Baseline | Final     | Δ          |
|-------------------------------------------|----------|-----------|------------|
| `/admin` First Load JS                    | 218 kB   | **99.6 kB** | **−118 kB / −54%** |
| `/admin/orders` First Load JS             | 223 kB   | **99 kB**   | **−124 kB / −56%** |
| `/admin/customers` First Load JS          | 214 kB   | **99 kB**   | **−115 kB / −54%** |
| `/admin/products` First Load JS           | 217 kB   | **104 kB**  | **−113 kB / −52%** |
| Largest single client chunk (decimal.js)  | 372 kB (in `/admin` initial) | **356 kB (async, lazy)** | moved off critical path |
| Brand `logo.png` on disk                  | 69 kB    | **60 kB**   | −13% |
| Build warnings                            | 4        | **1**       | −3 (the remaining one is pre-existing) |

The brief asked for ≥ 15% First Load JS reduction on the customer homepage.
**The customer homepage stayed at 104 kB** — see "regressions" below; it
was already small. The big wins are on admin, where Recharts was the
dominant problem.

## Per-route First Load JS — full diff

| Route                          | Baseline | Final     | Δ        | Notes |
|--------------------------------|----------|-----------|----------|-------|
| `/`                            | 104 kB   | 104 kB    | —        | already lean (no Recharts/Supabase client) |
| `/_not-found`                  | 88.4 kB  | 88.6 kB   | +0.2 kB  | shared chunk grew (lazy wrapper code) |
| `/account`                     | 96.4 kB  | 96.7 kB   | +0.3 kB  | same |
| `/account/addresses`           | 87.6 kB  | 87.9 kB   | +0.3 kB  | same |
| `/account/orders`              | 96.4 kB  | 96.7 kB   | +0.3 kB  | same |
| `/account/orders/[orderNumber]`| 96.4 kB  | 96.7 kB   | +0.3 kB  | same |
| `/account/settings`            | 96.4 kB  | 96.7 kB   | +0.3 kB  | same |
| **`/admin`**                   | **218 kB** | **99.6 kB** | **−118 kB** | recharts code-split |
| **`/admin/customers`**         | **214 kB** | **99 kB**   | **−115 kB** | recharts code-split |
| `/admin/customers/[id]`        | 96.4 kB  | 96.7 kB   | +0.3 kB  | shared-chunk creep |
| `/admin/imports`               | 96.4 kB  | 96.7 kB   | +0.3 kB  | same |
| `/admin/login`                 | 87.6 kB  | 87.9 kB   | +0.3 kB  | same |
| **`/admin/orders`**            | **223 kB** | **99 kB**   | **−124 kB** | recharts code-split |
| `/admin/orders/[orderNumber]`  | 98.4 kB  | 98.7 kB   | +0.3 kB  | shared-chunk creep |
| **`/admin/products`**          | **217 kB** | **104 kB**  | **−113 kB** | recharts code-split |
| `/admin/products/[id]`         | 103 kB   | 103 kB    | —        | |
| `/admin/purchase-orders`       | 96.4 kB  | 96.7 kB   | +0.3 kB  | shared-chunk creep |
| `/admin/purchase-orders/[id]`  | 98.4 kB  | 98.7 kB   | +0.3 kB  | same |
| `/admin/settings`              | 97.8 kB  | 98 kB     | +0.2 kB  | same |
| `/admin/vendors`               | 96.4 kB  | 96.7 kB   | +0.3 kB  | same |
| `/admin/vendors/[id]`          | 98.3 kB  | 98.5 kB   | +0.2 kB  | same |
| `/admin/vendors/new`           | 96.4 kB  | 96.7 kB   | +0.3 kB  | same |
| `/brand/[brand-slug]`          | 104 kB   | 105 kB    | +1 kB    | shared-chunk creep |
| `/cart`                        | 108 kB   | 108 kB    | —        | |
| `/checkout`                    | 135 kB   | 135 kB    | —        | already at floor (cart store + form) |
| `/for-business`                | 96.9 kB  | 97.1 kB   | +0.2 kB  | shared-chunk creep |
| `/login`                       | 152 kB   | 152 kB    | —        | dominated by supabase auth-js (unavoidable) |
| `/order/[orderNumber]`         | 102 kB   | 102 kB    | —        | |
| `/preview`                     | 96.4 kB  | 96.7 kB   | +0.3 kB  | shared-chunk creep |
| `/product/[slug]`              | 107 kB   | 107 kB    | —        | |
| `/shop`                        | 104 kB   | 105 kB    | +1 kB    | shared-chunk creep |
| `/shop/[category-slug]`        | 104 kB   | 105 kB    | +1 kB    | shared-chunk creep |

**Shared chunk:** 87.5 kB → 87.7 kB (+0.2 kB). Tiny uptick from the two new
`Lazy*Charts.tsx` wrappers landing in the shared graph. Net win across all
admin routes is roughly **−470 kB** of First Load JS.

## Pages that "regressed"

A handful of routes show a +0.2–1 kB uptick in First Load JS. Cause: the
new `LazyDashboardCharts.tsx` and `section/LazyCharts.tsx` files contribute
a small amount of dynamic-import boilerplate to the shared chunk that
every route loads. This was **a deliberate trade**: spending 0.2 kB on
every route to save 110+ kB on each of four admin routes.

No route regressed by more than 1 kB.

## Image inventory

Only three public images. All under 60 kB. Compression pass results:

| File                        | Baseline | Final  | Δ     | Notes |
|-----------------------------|----------|--------|-------|-------|
| `public/brand/logo.png`     | 69 kB    | 60 kB  | −13%  | pngquant 75–90 |
| `public/brand/logo-small.png` | 8.8 kB | 8.5 kB | −3%   | pngquant 75–90 |
| `public/brand/icon.png`     | 12 kB    | 12 kB  | —     | pngquant produced larger output, kept original |
| `src/app/icon.png`          | 12 kB    | 12 kB  | —     | mirror of brand/icon.png — Next App Router favicon |

**WebP variants tried, then rejected.** For these specific hand-lettered,
high-contrast wordmark images, palette PNG (256 colors) compresses to a
floor that lossy WebP can't beat without visible artifacts. WebP versions
came out 70–160% **larger** than the palette PNG. Documented in the
Phase 2 commit.

## `<img>` → `next/image` migrations

All three live `<img>` tags migrated to `next/image` with static imports:

| File                                       | Status | Notes |
|--------------------------------------------|--------|-------|
| `src/components/layout/Nav.tsx`            | ✓ migrated | `priority`, blur placeholder, sizes hint |
| `src/components/layout/Footer.tsx`         | ✓ migrated | inline `filter: invert(1)` preserved |
| `src/components/admin/AdminTopRail.tsx`    | ✓ migrated | `priority` + invert filter |
| `src/components/shop/ImageWithFallback.tsx` | already `<Image>` | spreads alt from caller — triggers a false-positive lint warning (pre-existing, not from this branch) |

Static imports mean the build pipeline fingerprints the file and Next
serves AVIF/WebP variants per browser via `/_next/image`.

## Dependencies — added / removed / refactored

**Added:**
- `@next/bundle-analyzer` (devDep) — toggle with `ANALYZE=true pnpm build`.

**Removed:** none.

**Orphan deps still in `package.json`** (worth a follow-up cleanup, but
out of scope for this brief):
- `date-fns@^4.1.0` (33 MB on disk) — no `from 'date-fns'` import
  anywhere in `/src`.
- `react-email@^6.0.0` (1.4 MB) — no import in `/src`.

Both are likely leftovers from earlier exploration; safe to `pnpm remove`
in a follow-up. They don't affect the client bundle today since they
aren't imported, but they slow `pnpm install` and clutter the lockfile.

## Heavy-dep audit (per the brief's checklist)

| Package          | In customer bundle? | Notes |
|------------------|---------------------|-------|
| `recharts`       | **No** — code-split into `9788.*.js` async chunk | only loads on /admin routes after hydration |
| `lucide-react`   | Tree-shaken named imports only — `import { Search, Menu } from 'lucide-react'`. `sideEffects: false` honoured. ~3 KB per icon. ✓ |
| `date-fns`       | Not imported anywhere ✓ |
| `@supabase/supabase-js` + `@supabase/ssr` | On `/login` (152 kB), `/account/*` (96 kB), `/admin` paths. Required for auth. Not in homepage. ✓ |
| `authorizenet`   | Server-only via `'server-only'` import in `src/lib/authnet/`. ✓ |
| `zustand`        | Customer bundle (cart store) — small, expected. ✓ |
| `zod`            | 5.6 MB on disk but only `import type` usages inside `src/lib/checkout/validate.ts` — tree-shake removes runtime cost. |
| `react-email`    | Not imported anywhere ✓ |

## Caching headers added (Phase 5)

```
/brand/*        Cache-Control: public, max-age=31536000, immutable
/fonts/*        Cache-Control: public, max-age=31536000, immutable
/_next/static/* Cache-Control: public, max-age=31536000, immutable
/favicon.ico    Cache-Control: public, max-age=3600
```

Plus:
- `compress: true` (default — pinned for self-hosted parity)
- `poweredByHeader: false`
- `images.formats: ['image/avif', 'image/webp']` — Next now serves AVIF
  to browsers that support it, with WebP fallback.

## Font optimization (Phase 3)

Was already on `next/font/google` with `display: 'swap'` and `latin`-only
subsets. Tightened:

| Family          | Before | After | Removed |
|-----------------|--------|-------|---------|
| Fraunces normal | 300 / 400 / 500 / 600 | 300 / 400 / 500 | 600 (zero usages in `/src`) |
| Fraunces italic | all weights | all weights | — (60+ italic call sites kept it) |
| JetBrains Mono  | 300 / 400 / 500 | 400 / 500 | 300 (no `font-light` on `.font-mono`) |

Also:
- Native-stack fallbacks (`Georgia, Cambria, Times New Roman, serif` for
  Fraunces; `ui-monospace, SFMono-Regular, Menlo` for JetBrains) so layout
  doesn't reflow before the woff2 arrives.
- `preload: false` on JetBrains — it's below-the-fold filler on every
  page; lazy-load is the right call.
- Three fewer woff2 files emitted by next/font.

## What I did NOT touch

Per the brief:
- `src/app/api/*` — untouched
- `src/lib/authnet/*` — untouched
- `src/lib/supabase/*` — untouched
- `src/lib/resend/*` — untouched
- `scripts/*` — untouched
- `supabase/migrations/*` — untouched
- No business logic, copy, pricing, or component restructuring

## Risks / things to manually verify before merging

1. **Admin charts now lazy-load.** Click into `/admin`, scroll to
   widgets — they should appear after a brief skeleton state. Ditto for
   `/admin/orders|customers|products` after expanding the analytics panel.
   The skeleton frame shows "Loading…" and preserves layout dimensions
   so there's no CLS, but worth a sanity check on slow connections.
2. **Logo blur placeholder.** With `placeholder="blur"`, the static
   import generates a tiny base64 LQIP. Inspect the homepage to confirm
   the logo doesn't flash a wrong color before the real PNG hydrates.
3. **Image filter on Footer + AdminTopRail.** The `style={{ filter:
   'invert(1)' }}` got moved from `<img style>` to `<Image style>` —
   should still apply, but worth a visual check on the dark footer band.
4. **Cache headers on /brand/*.** Once shipped, the logo URL is
   effectively immutable for a year. If you need to swap the logo file
   before then, change the import path in Nav/Footer/AdminTopRail (Next
   will fingerprint the new URL automatically when fetched via the
   `<Image>` pipeline, but direct `<img src="/brand/logo.png">` accesses
   would be cached for a year).
5. **Font weight 600 removed from Fraunces.** I confirmed zero usages
   in `/src` — but if any user-generated copy or third-party script
   tries to apply weight 600, the browser will synthesize bold rather
   than have it look right. Low risk but worth knowing.
6. **AVIF format negotiation.** Some older browsers (Safari < 16,
   anything not advertising `image/avif` in Accept) will fall back to
   WebP, then JPEG. All paths tested in dev — production behaviour is
   identical.
7. **Pre-existing lint warning** in `src/components/shop/ImageWithFallback.tsx`
   line 16 — the alt prop is spread from the caller, lint can't see
   that. Not from this branch; flagged so it doesn't get blamed on the
   refactor.

## Build status

```
pnpm build           → ✓ success
pnpm exec tsc --noEmit → ✓ clean (one pre-existing test-file BigInt warning, unrelated)
ESLint warnings       → 1 (pre-existing, ImageWithFallback alt-text false-positive)
```

Branch local — no `git push` run, ready for review.
