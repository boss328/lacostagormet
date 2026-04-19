# Pre-deploy report — La Costa Gourmet

**Branch:** `main` (local, **not** pushed)
**Date:** 2026-04-19
**State:** deploy-ready after running two SQL files in Supabase.

`git log` (newest first, since the start of this session):
```
3b46a0f Label brand treemap scope (linked orders only)
4c6043b Wire /for-business form: API + DB + email + admin inbox
70d63b7 Add /brand index page (was 404)
44056fb Fix Cocoa category image (stale Unsplash ID)
397d3db Remove orphan deps: date-fns, react-email
6e62c45 Phase 7 perf (6/N): performance report          ← Phase 7 merge starts here
3e5abb0 Phase 7 perf (5/N): cache headers, AVIF, compression flags
792be04 Phase 7 perf (4/N): code-split recharts off the admin First Load
cb1cfa6 Phase 7 perf (3/N): trim font weights, add metric-matched fallbacks
758ed57 Phase 7 perf (2/N): pngquant logos, migrate <img> → next/image
86708c1 Phase 7 perf (1/N): wire @next/bundle-analyzer
```

## What was fixed this session

| #  | Item                                 | Status | Notes |
|----|--------------------------------------|--------|-------|
| P1 | Merge `phase-7-performance` → `main` | ✓ done | clean fast-forward, build passes |
| P2 | Remove orphan deps                   | ✓ done | `date-fns`, `react-email` — confirmed zero imports in `/src` and `/scripts` |
| P3 | Cocoa category image broken          | ✓ done | Unsplash ID `1542990253-0b8be6ae9224` was deleted upstream → 404. Swapped to verified-live `1481391319762-47dff72954d9`. **No SQL needed** (see "Cocoa decision note" below) |
| P4 | `/brand` nav 404                     | ✓ done | added `src/app/brand/page.tsx` index, smoke-tested 200. Nav link unchanged. |
| P5 | `/for-business` form unwired         | ✓ done | API + DB + Resend + admin inbox + sidebar nav. **SQL migration required** (see below) |
| P6 | Brand treemap mislabelled            | ✓ done | eyebrow now reads "§ Brand share (linked orders)" with footnote "18% of historical orders retain SKU linkage" |
| P7 | Final verification + report          | ✓ done | `pnpm build` clean, this report |

### Cocoa decision note

The brief asked for `scripts/fix-cocoa-image.sql`. I didn't write one because the actual situation is different from the assumption:

- **Every** category in the DB has `image_url = NULL`. That's by design — `src/lib/placeholder-images.ts` is the source of truth for category tile imagery until Jeff's product shoot lands. The file's header comment confirms this is intentional.
- Only the Cocoa entry in that map pointed at a stale Unsplash ID. Other category IDs in the same map all returned 200 when probed.

Writing a SQL `UPDATE` on `categories.image_url` would diverge the DB from the placeholder map without anything reading it. The fix lives in code (commit `44056fb`) where the bug actually was. **No Supabase action needed for this one.**

## Migrations to run in Supabase SQL editor BEFORE deploy

Only one new migration this session:

| File | What it does |
|------|---|
| `scripts/migration-0007-inquiries.sql` | Creates `inquiries` table (status enum: new/contacted/archived) + `inquiry_rate_limit` table (per-IP, 1-hour window) + indexes + RLS-enabled-with-no-policies. **Required before /for-business will work.** |

Paste the file contents into the Supabase SQL Editor and run. It's idempotent (`CREATE TABLE IF NOT EXISTS`), so re-running it is safe.

## Vercel environment variables required

Code references exactly these (`grep process.env.\* src/`). All names; no values.

**Required (build-time):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` — used in `metadataBase` for canonical URLs

**Required (runtime — server only):**
- `SUPABASE_SERVICE_ROLE_KEY` — bypasses RLS for admin + API routes
- `ADMIN_PASSWORD` — single password gating `/admin/*`
- `RESEND_API_KEY` — vendor PO + new inquiry emails
- `REPLY_TO_EMAIL` — destination for inquiry-form submissions; reply-to on vendor PO emails. Defaults to `jeff@lacostagourmet.com` if unset.
- `AUTHNET_API_LOGIN_ID`
- `AUTHNET_TRANSACTION_KEY`
- `AUTHNET_ENVIRONMENT` — `production` or `sandbox`

**Optional:**
- `VENDOR_EMAIL_FROM` — sender domain. Defaults to `orders@lacostagourmet.com`. **Must be on a verified Resend domain** or sends will fail.
- `NODE_ENV` — Vercel sets this automatically.

**Unused by code, present in `.env.local`** (safe to skip on Vercel unless you want them on hand):
`ADMIN_EMAILS`, `AUTHNET_SIGNATURE_KEY`, `NEXT_PUBLIC_AUTHNET_*`, `NEXT_PUBLIC_BC_CDN_BASE`, `GMAIL_*`, `QBO_*`, `RESEND_FROM_EMAIL` (the code reads `VENDOR_EMAIL_FROM` instead — be aware of the naming mismatch).

## Manual test checklist for post-deploy

Run through this in order. The first failure is usually the most informative.

### Customer-facing
- [ ] **`/`** loads, hero is visible, logo (the hand-lettered wordmark) renders in the nav, no console errors
- [ ] Category grid on `/` shows all six tiles **with** the Cocoa image rendered (was the bug)
- [ ] **`/shop/cocoa`** loads, products visible, filter bar works
- [ ] **`/brand`** loads (was 404), shows the 14-brand grid with item counts
- [ ] **`/brand/big-train`** still works (regression check on the dynamic route)
- [ ] **`/for-business`** loads, the inquiry form is enabled (no "Form wiring arrives in Phase 5" footnote), submit a real test inquiry. Expect success card "We got it. Jeff will reply within one business day."
- [ ] Verify a row landed in Supabase `inquiries` table and Jeff received the Resend email

### Admin
- [ ] **`/admin`** redirects to `/admin/login`, password gate works
- [ ] **`/admin`** dashboard renders. Recharts widgets (Revenue, AOV, LTV) show a "Loading…" skeleton then hydrate (this is the Phase 7 lazy-load behavior — expected)
- [ ] Brand treemap eyebrow reads "§ Brand share (linked orders)" with the muted-italic footnote
- [ ] **`/admin/inquiries`** shows the test submission you just made. Click "Mark contacted" → row moves to the Contacted tab
- [ ] Sidebar shows § VII. Inquiries entry with the `g n` shortcut hint on hover

### Checkout — the big one (cannot be tested in dev)
- [ ] Add a product to cart, go to `/checkout`, fill in shipping + billing, click Pay
- [ ] Browser is redirected to Auth.net's hosted page (not our domain)
- [ ] Complete a real-card test. After payment, browser comes back to `/order/<order_number>` with the success view
- [ ] Verify in Supabase: `orders.status = 'paid'`, `payments` has a row with `status = 'succeeded'`, `payment_audit_log` has a `payment_inserted` event
- [ ] Auto-draft fires: `vendor_orders` should have one row per vendor for this order with `status = 'pending'`. Open the PO at `/admin/purchase-orders/<id>`, click Send. Vendor should receive the email.

## Known risks for the deploy

1. **Auth.net callback has never been exercised end-to-end.** Localhost can't be reached by Auth.net's hosted page, so the callback path is testable only after first deploy. The callback URL is **derived from the request origin at `create/route.ts`** (`${origin}/api/checkout/hosted-callback?orderNumber=…`) — there is **no `AUTHNET_HOSTED_RETURN_URL` env var to set**, despite what the prior session brief mentioned. If the callback fails on Vercel, check:
   - The Vercel deployment URL is reachable over HTTPS (it always is)
   - The Auth.net merchant portal's "Response/Receipt URLs" allowlist includes `https://<your-vercel-host>/api/checkout/hosted-callback` — Auth.net rejects callbacks to URLs not pre-registered in the merchant settings. **This is the most likely failure mode.**
   - The customer's browser allows third-party cookies (Auth.net may set a session cookie on the hosted page that the callback inherits)

2. **First Resend send may fail if `VENDOR_EMAIL_FROM` is on an unverified domain.** Resend rejects sends from unverified senders. Default is `orders@lacostagourmet.com`; verify the lacostagourmet.com domain in the Resend dashboard before deploying.

3. **The inquiry form uses `x-forwarded-for` for rate limiting.** Vercel sets this correctly. Behind any other proxy, the rate limit could either rate-limit the proxy's IP (false positive) or fail to rate-limit at all (false negative). Vercel-only deploy → not a concern.

4. **`pnpm start` cannot be smoke-tested in this development sandbox** because Node is launched with `--disallow-code-generation-from-strings`, which Next 14's edge-middleware runtime needs. The build itself succeeds and middleware compiles correctly — production deploys are unaffected. This is a sandbox quirk, not a bug. (P4's `/brand` 200 was verified earlier in the session before the sandbox flag became a blocker.)

5. **Pre-existing lint warning** in `src/components/shop/ImageWithFallback.tsx:16` (`alt-text` rule false-positive — alt is spread from caller props). Not from this session, but flagged so it doesn't get blamed on the new work.

## Build status

```
pnpm build               → ✓ success (zero new warnings)
pnpm exec tsc --noEmit   → ✓ clean
ESLint warnings          → 1 (pre-existing ImageWithFallback alt-text false-positive)
```

## What to do next

1. Open Supabase SQL Editor → paste `scripts/migration-0007-inquiries.sql` → run
2. Push `main` to GitHub: `git push origin main` (this branch is 11 commits ahead of `origin/main`)
3. On Vercel, set the env vars listed above
4. Deploy
5. Walk the manual test checklist
6. If everything works, ship it
