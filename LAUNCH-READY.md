# Launch-ready report — La Costa Gourmet

**Branch:** `main` (local, **not** pushed, 15 commits ahead of `origin/main`)
**Date:** 2026-04-19
**State:** deploy-ready after applying one SQL file in Supabase.

## Commits this branch is ahead of origin/main

```
17ecab6 Add robots.txt route
a79b1e7 Add dynamic sitemap.xml route for SEO
0c8a5de Add 204 BC→Next.js URL redirects for SEO migration
6bfcf93 Final verification and deploy-ready report
3b46a0f Label brand treemap scope (linked orders only)
4c6043b Wire /for-business form: API + DB + email + admin inbox
70d63b7 Add /brand index page (was 404)
44056fb Fix Cocoa category image (stale Unsplash ID)
397d3db Remove orphan deps: date-fns, react-email
6e62c45 Phase 7 perf (6/N): performance report
3e5abb0 Phase 7 perf (5/N): cache headers, AVIF, compression flags
792be04 Phase 7 perf (4/N): code-split recharts off the admin First Load
cb1cfa6 Phase 7 perf (3/N): trim font weights, add metric-matched fallbacks
758ed57 Phase 7 perf (2/N): pngquant logos, migrate <img> → next/image
86708c1 Phase 7 perf (1/N): wire @next/bundle-analyzer
```

## Migrations to apply in Supabase before push

Just one file. Paste into Supabase SQL Editor and run:

| File | What it does |
|------|---|
| `scripts/migration-0007-inquiries.sql` | Creates `inquiries` table (with status enum + RLS) and `inquiry_rate_limit` table (per-IP, 1-hour window) for the /for-business form. Idempotent. |

> Skip the cocoa fix — that landed in code (`src/lib/placeholder-images.ts`),
> not SQL. See `FINAL-REPORT.md` for the full reasoning.

## Environment variables required on Vercel

Audited from `grep process.env.\* src/`. All names; no values.

**Required (build-time):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` — used by `metadataBase`, `sitemap.xml`, and `robots.txt`. **Set this to your custom domain (e.g. `https://lacostagourmet.com`) before flipping DNS** so the sitemap publishes the canonical URL.

**Required (runtime, server-only):**
- `SUPABASE_SERVICE_ROLE_KEY` — bypasses RLS for admin + API routes
- `ADMIN_PASSWORD` — single password gating `/admin/*`
- `RESEND_API_KEY` — vendor PO + new inquiry emails
- `REPLY_TO_EMAIL` — destination for inquiry submissions; reply-to on vendor PO emails. Defaults to `jeff@lacostagourmet.com` if unset.
- `AUTHNET_API_LOGIN_ID`
- `AUTHNET_TRANSACTION_KEY`
- `AUTHNET_ENVIRONMENT` — `production` or `sandbox`

**Optional:**
- `VENDOR_EMAIL_FROM` — sender domain. Defaults to `orders@lacostagourmet.com`. **Must resolve to a verified Resend domain** or every send fails.
- `NODE_ENV` — Vercel sets this automatically.

## Deploy order (do these in sequence)

1. **Apply SQL.** Open Supabase SQL Editor → paste `scripts/migration-0007-inquiries.sql` → run. Verify via `select * from inquiries limit 1;` (returns 0 rows, no error).
2. **Push.** `git push origin main` (15 commits go up).
3. **Set env vars on Vercel** (project settings → Environment Variables). Use values from `.env.local`. Set `NEXT_PUBLIC_SITE_URL` to the **eventual** custom domain, not the Vercel preview URL.
4. **First deploy.** Trigger from the Vercel dashboard or wait for the auto-deploy. Confirm the build log shows the routes table including `/sitemap.xml`, `/robots.txt`, `/brand`, `/admin/inquiries`.
5. **Smoke-test on the Vercel URL** (before flipping DNS) — walk the manual checklist in `FINAL-REPORT.md`. The two new things to also verify:
   - `https://<vercel-url>/sitemap.xml` — should be a valid XML document with the homepage, all categories, all brands, every active product
   - `https://<vercel-url>/robots.txt` — should disallow `/admin /account /api /cart /checkout` and point Sitemap at `${NEXT_PUBLIC_SITE_URL}/sitemap.xml`
   - At least one BC redirect: `curl -I https://<vercel-url>/blog/` — expect `308 Permanent Redirect` to `/blog`
6. **Custom domain** — add it in Vercel project settings (DNS verification step).
7. **DNS flip.** Update the apex (or www → apex) CNAME / A records to point at Vercel. Wait for propagation.
8. **Final smoke test on the real domain.** Especially: (a) Auth.net hosted page accepts the callback URL — see "Known risks" in `FINAL-REPORT.md` for the merchant-portal allowlist step; (b) submit a real test inquiry via /for-business and confirm Jeff's inbox + Supabase row.
9. **Submit sitemap to Google.** In Search Console → Sitemaps → submit `https://lacostagourmet.com/sitemap.xml`. Re-submit after the first batch of products gets indexed (1–2 weeks).

## SEO surfaces shipping in this push

| Route                        | Status | Notes |
|------------------------------|--------|-------|
| 204 BC→Next URL redirects   | ✓      | All `permanent: true` (308). Verified in `.next/routes-manifest.json`. Preserves PageRank from legacy URLs (`/blog/`, `/dr-smoothie/`, every product slug). |
| `/sitemap.xml`              | ✓      | Dynamic, force-dynamic, lastModified threaded from `updated_at`. 9 static pages + every active category, brand, product. |
| `/robots.txt`               | ✓      | Allow all, disallow private surfaces, sitemap pointer. |
| `metadataBase`              | already in `src/app/layout.tsx` | Uses `NEXT_PUBLIC_SITE_URL` so OG / canonical URLs are correct. |

## Build status

```
pnpm build               → ✓ success
pnpm exec tsc --noEmit   → ✓ clean (one pre-existing test-file BigInt warning, unrelated)
ESLint warnings          → 1 (pre-existing ImageWithFallback.tsx alt-text false-positive)
Routes manifest          → 205 redirects (204 BC + 1 Next default trailing-slash)
Working tree             → clean
```

## What this branch is NOT changing

- `src/app/api/checkout/`, `src/lib/authnet/`, `src/lib/supabase/` — untouched per guardrails
- `src/middleware.ts` — untouched
- The 204 redirect entries themselves — only the file extension and TS type annotation
- Any business logic, copy, pricing, or component structure
- No `git push`, no Vercel deploy, no SQL applied. All manual.
