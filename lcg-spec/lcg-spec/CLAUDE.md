# CLAUDE.md — Session Primer

**Read this file first, every session.** It's the quick-reference so you stay oriented without re-reading the whole spec.

## Who you're helping
**Asher** — 19, owns multiple startups, built Healthy Aminos on the same stack. Rebuilding his grandpa's e-commerce site (lacostagourmet.com) in a weekend. Budget is tight ($1K profit), timeline is aggressive.

## What you're building
Next.js 14 replacement for a BigCommerce store selling café supplies (chai, cocoa, syrups, frappé mixes) to cafés + home users. 2000+ SKUs, multi-vendor dropship via **email-based handoff** (no API — explicitly rejected by grandpa). Auth.net Accept.js payments, Supabase backend, deploys to Orange Website VPS.

## Read before writing code

| When | Read |
|---|---|
| Every session start | `00-elevator-pitch.md`, `CLAUDE.md` (this file), `08-tasks/8.2-progress.md` |
| Database work | `03-data-model/3.1-schema.md` |
| **ANY UI / component / page work** | **`01-context/1.3-design-system.md` (authoritative)** + `01-context/1.2-brand-and-design.md` (context) |
| Checkout / payments | `04-features/4.1-checkout-and-payment.md` |
| Admin order flow | `04-features/4.2-vendor-fulfillment.md` |
| Admin finance | `04-features/4.3-admin-dashboard.md` |
| Customer accounts | `04-features/4.4-customer-account.md` |
| Any third-party | `05-integrations/5.1-integrations.md` |
| Migration scripts | `06-migration/6.1-migration-plan.md` |
| Deployment | `07-launch/7.1-launch-plan.md` |

## Rules you must never break

1. **Card data never touches the server.** Always Accept.js hosted fields.
2. **RLS on every Supabase table.** Default deny, whitelist access.
3. **Snapshot prices and costs at transaction time.** Never join back to live tables for historical margin.
4. **Follow `1.3-design-system.md` exactly.** Warm mercantile palette (paper/ink/brand/gold), Fraunces serif + JetBrains Mono only, italic accent words in every headline, catalog-style section numbering (§ I, § II), staggered animations on page load, uniform image color-grading. **No purple. No Inter. No pure white or pure black. No rounded corners on product cards. No icon libraries for decorative icons.** When in doubt, re-read 1.3 and use the sanctioned pattern.
5. **Every page uses a template from `1.3-design-system.md` "Page Templates".** Don't invent new layouts.
6. **Vendor emails go through grandpa's Google Workspace account,** not Resend. Customer emails go through Resend.
7. **No API integration with any vendor in v1.** Grandpa said no. Phase 2 decision, revisit after we see real supplier data.
8. **Auto-send toggle for vendor emails defaults to OFF.** Never ship with it on.
9. **Every URL change needs a 301 redirect.** 22 years of SEO at stake.
10. **Assume grandpa will read every line of admin UI.** Plain English, no jargon, no "lorem ipsum" slop left in production.
11. **Login supports BOTH magic link AND email+password.** Magic link is the default option and the path migrated customers use for first login. Don't ship a password-only login screen.

## Brand voice in one line
Mom-and-pop warm, B2B credible. Think **King Arthur Baking**, not Amazon or Etsy. "We've been doing this since 2003" beats "La Costa Gourmet has been operating since 2003."

## Tech stack in one line
Next.js 14 App Router + TypeScript (strict) + Tailwind + Supabase (Postgres + Auth + Storage) + Auth.net Accept.js + Resend + Gmail API + QuickBooks Online, deployed to Orange VPS with PM2 + Nginx. **No TaxJar v1** — catalog is non-taxable grocery food, tax returns $0. Wire TaxJar in v2 if needed.

## What's out of scope for v1

**Amazon Seller Central integration** (Phase 2 project, priced separately). Jeff runs an Amazon storefront that ships via Houston's — v1 does NOT touch it. `orders.source` column exists so Amazon orders can slot in later cleanly. Do NOT build any Amazon SP-API client, inventory sync, or Amazon order pull in v1.

Also out of scope: real-time shipping rates, gift certificates, product reviews, currency switcher, Klaviyo/Mailchimp, subscribe-and-save, granular admin permissions, real wholesale portal. See `README.md` for the full list.

## Shipping rules (hardcoded into defaults, configurable in settings)

```
if state in ('HI', 'AK'): shipping = $12.99 + $25 = $37.99
elif subtotal >= $70:     shipping = $0 (free ground)
else:                     shipping = $12.99
```

## Vendor list

Houston's Inc. (primary, 2 warehouses), Sunny Sky/Dr. Smoothie, Mocafe, David Rio, Monin, Torani, Kerry/Big Train, DaVinci Gourmet, iBev/Upouria, Smartfruit, Tiki Breeze. Full details in `04-features/4.2-vendor-fulfillment.md`.

## Pending items (as of last update)

See `08-tasks/8.2-progress.md` → "Blocked / waiting on" section.

## When in doubt

- Consult the spec file for the feature you're building
- If the spec doesn't cover it, make a reasonable call and note it in `08-tasks/8.2-progress.md` → "Decisions made mid-build"
- **Never silently invent business logic.** If grandpa's intent is unclear, flag it as a TODO or ask Asher before building.
