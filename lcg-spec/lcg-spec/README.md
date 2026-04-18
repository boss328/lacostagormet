# La Costa Gourmet — Site Rebuild Spec

This folder is the single source of truth for rebuilding **lacostagourmet.com**. It's designed to be fed to Claude Code as project context so it doesn't re-derive architectural decisions every session.

## How to use this with Claude Code

1. Clone this folder into the root of your new Next.js project as `.claude-spec/` or similar
2. At the start of each Claude Code session, instruct it to read `README.md`, `00-elevator-pitch.md`, and whichever section you're working on
3. When you finish a task, update `08-tasks/progress.md` so the next session knows what's done

## Folder map

| Folder | What's in it | Read when... |
|---|---|---|
| `01-context/` | Who grandpa is, who customers are, brand positioning, **design system (1.3 — read before ANY UI work)** | Every session, first |
| `02-architecture/` | Stack, hosting, file structure, deployment | Setting up the repo or deploying |
| `03-data-model/` | Supabase schema, relationships, RLS policies | Writing migrations or any DB code |
| `04-features/` | Feature specs — admin, checkout, account, vendor routing, recommendations | Building a specific feature |
| `05-integrations/` | Auth.net, Google Workspace SMTP, TaxJar, QuickBooks, ShipStation | Wiring up a third-party service |
| `06-migration/` | BigCommerce customer/order export, URL redirects, product catalog seed | Doing data migration work |
| `07-launch/` | Staging setup, pre-launch checklist, DNS cutover | Final week before launch |
| `08-tasks/` | Ordered task list + progress tracking | Picking the next thing to build |
| `references/` | Vendor spreadsheets, BigCommerce exports, logos, reference designs | Populating the catalog or design |

## What grandpa still needs to send

These items are pending and will be dropped into `references/` when received:

- [ ] Google Workspace app password or OAuth grant
- [ ] BigCommerce admin credentials
- [ ] Houston's Inc. product spreadsheet
- [ ] Dr. Smoothie / Sunny Sky product spreadsheet
- [ ] Mocafe product spreadsheet
- [ ] Any other vendor spreadsheets (David Rio, Monin, Torani, Kerry, etc.)
- [ ] Authorize.net AFDS rules export
- [ ] Original logo file (high-res)
- [ ] 2-3 reference websites he likes the look of

Until these land, placeholder defaults are documented per-section and flagged with `<!-- TBD: ... -->`.

## Core decisions (read this first, always)

- **Stack:** Next.js 14 App Router + Supabase + Auth.net Accept.js + Resend + Google Workspace SMTP + QuickBooks Online
- **Tax:** zero by default (Jeff's catalog is non-taxable grocery food in California). TaxJar is a v2 option if he ever adds taxable SKUs.
- **Hosting:** Orange Website VPS (Iceland), same as Healthy Aminos
- **Payment:** Authorize.net → Wells Fargo (keep grandpa's existing merchant account)
- **Fulfillment model:** multi-vendor dropship via email to each vendor (Houston's, Sunny Sky, Mocafe, direct-to-brand for others). NOT via API — grandpa explicitly rejected API integration.
- **Product catalog source:** vendor spreadsheets (not BigCommerce export) — fresher, more accurate
- **Tone:** mom-and-pop warm + B2B professional. Think King Arthur Baking, not Amazon
- **Launch:** staging URL first, then DNS cutover
- **SEO:** preserve 22 years of domain authority via exhaustive 301 redirect map
- **Builder:** Asher (full-stack Next.js, same stack as Healthy Aminos)
- **Maintainer post-launch:** Asher + grandpa (grandpa manages products/prices, Asher handles code)
- **Budget:** $1K profit to Asher, all infra on grandpa's dime
- **Timeline:** weekend build, iterative polish afterward

## Out of scope for v1

Explicit non-goals, to prevent scope creep:

- **Amazon Seller Central integration (Phase 2 project, separately priced).** Jeff has a real Amazon storefront that ships via Houston's email handoff. v1 does NOT integrate with Amazon — he continues using Seller Central directly. Phase 2 will add Amazon order sync into the admin, inventory sync between channels, and tracking push-back. Schema is Phase-2-ready: `orders.source` column and `order_source` enum already present.
- Real-time carrier shipping rates (phase 2 — v1 uses flat rate rules)
- Gift certificates (current site has, v1 doesn't — add in v2)
- Product reviews (add in v2)
- Currency switcher (current site has USD/CAD, nobody uses it)
- Klaviyo / Mailchimp integration (v1 has simple Supabase newsletter list)
- Blog content migration (v1 has blog infrastructure, no posts migrated)
- Subscribe-and-save / recurring orders (phase 2)
- Multi-admin with permission roles (v1 is just Asher + grandpa, both full admin)
- Wholesale pricing portal (v1 has "contact us for 10+ cases" messaging, no real B2B portal)
