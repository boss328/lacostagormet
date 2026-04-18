# La Costa Gourmet — Claude Code Playbook

**Your complete weekend build guide.** Paste these prompts into Claude Code in order. Each phase ends when its build passes and the next phase can start.

---

## Before you start: prep checklist

Do these once, before touching Claude Code. 45 min total.

### 1. Create the project folder + unzip spec
```bash
mkdir -p ~/projects/lacostagourmet
cd ~/projects/lacostagourmet
# Drag lcg-spec.zip into this folder, then:
unzip lcg-spec.zip
# Now you have ~/projects/lacostagourmet/lcg-spec/
```

### 2. Create your Supabase project
- Go to supabase.com, create new project named `lacostagourmet-prod`
- Region: `us-west-1` (closest to Carlsbad)
- Save the DB password to 1Password immediately
- From project Settings → API, copy:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`

### 3. Create Resend account + domain
- Resend.com → new account
- Add domain `lacostagourmet.com`
- Add the DNS records they show you to your current DNS (wherever BC domain is registered)
- Wait for verification (usually 5-10 min)
- Generate API key → copy it

### 4. Get Auth.net sandbox credentials
- sandbox.authorize.net → create merchant account (free, instant)
- Settings → API Credentials & Keys → copy:
  - `API Login ID`
  - `Transaction Key`
  - `Client Key` (also called Public Client Key)
- These are for DEVELOPMENT only. Jeff's production credentials come later.

### 5. Install Node 20 LTS + pnpm if not already
```bash
node --version   # should be v20.x or v22.x
npm i -g pnpm
```

### 6. Register lacostagourmet.com on Cloudflare (optional but recommended)
- Free tier is fine
- Transfer DNS → gives us instant DNS cutover when launching
- Don't move the A record yet — just get DNS ready

### 7. Spin up your VPS (can defer to Phase 7)
- Orange Website Iceland or whoever — same stack as Healthy Aminos
- Ubuntu 22.04, 2GB RAM minimum, 4GB recommended
- Save SSH key, IP address

---

## How to use this playbook with Claude Code

1. **Open Claude Code in the lacostagourmet project folder** (the one containing `lcg-spec/`)
2. **Start EVERY session with the kickoff prompt below** — it primes Claude Code to read the spec before writing code
3. **Run phases in order.** Do not skip ahead. Phase 2 depends on Phase 1's database being real.
4. **After each phase, verify the "Definition of Done" before moving on.** Don't let "mostly working" bleed into the next phase — that's where weekend builds die.
5. **If something breaks or gets confusing, stop and ask Claude Code to explain what it just did.** Don't let it accumulate debt.

---

## SESSION KICKOFF PROMPT (paste at start of every Claude Code session)

```
Read these files in order before doing anything:

1. lcg-spec/CLAUDE.md (session primer — the 11 rules)
2. lcg-spec/README.md (project overview + out-of-scope list)
3. lcg-spec/08-tasks/8.2-progress.md (what's done, what's next)
4. lcg-spec/08-tasks/8.1-task-list.md (the ordered phase list)

Then tell me:
- What phase we're in
- What's next on the task list
- Any open decisions or blockers from the progress log

Do not write any code until I confirm the plan.
```

Use this EVERY session. It's the single most important thing that keeps Claude Code on rails. Without it, Claude Code forgets context between sessions and starts making up structure.

---

# PHASE 0 — Project scaffold (30-45 min)

**Goal:** Next.js 14 App Router project scaffolded, Supabase connected, env vars in place, dev server running.

## Prompt

```
We're starting Phase 0 — project scaffold for La Costa Gourmet.

Tasks:
1. Initialize a new Next.js 14 App Router project in this directory (NOT a subfolder — init in current directory)
   - TypeScript strict mode
   - Tailwind CSS
   - App Router
   - Use pnpm
   - Name: lacostagourmet
2. Install dependencies per lcg-spec/08-tasks/8.1-task-list.md Phase 0 list
3. Create the folder structure from lcg-spec/02-architecture/2.1-overview.md (the "Folder layout" section)
4. Create .env.local with all env var slots from the architecture doc, commented for the ones we don't have yet
5. Create .env.example mirroring .env.local but without real values — for git
6. Create a basic app/layout.tsx, app/page.tsx with placeholder "La Costa Gourmet" text
7. Initialize Supabase client helpers at lib/supabase/ (server, client, admin variants)
8. Install git, make initial commit
9. Run `pnpm dev` and confirm it boots on localhost:3000

Do NOT write any business logic yet. This is purely scaffolding.

Before you start, show me:
- The exact pnpm commands you'll run
- Any deviations from the spec you think are needed

Wait for my approval.
```

## Definition of Done
- [ ] `pnpm dev` shows "La Costa Gourmet" at localhost:3000
- [ ] `.env.local` exists with Supabase credentials filled in
- [ ] Folder structure matches the spec exactly
- [ ] First git commit made
- [ ] Type-check passes (`pnpm tsc --noEmit`)

---

# PHASE 1 — Database schema (1-1.5 hrs)

**Goal:** Every table from the spec exists in Supabase, with the right relations, enums, RLS policies, and seed data.

## Prompt

```
Phase 1 — Supabase database schema.

Read lcg-spec/03-data-model/3.1-schema.md end to end before writing anything.

Tasks:
1. Generate a single SQL migration file at supabase/migrations/0001_initial_schema.sql
   - All enums first (order_status, fulfillment_status, order_source, vendor_order_status, etc.)
   - All tables in dependency order (brands and categories before products, etc.)
   - All foreign keys + ON DELETE behaviors as specified
   - All indexes the spec calls out
2. Generate supabase/migrations/0002_rls_policies.sql
   - Anon role: public SELECT on products/brands/categories/vendors (active only), can INSERT into orders + order_items (guest checkout), can INSERT customers
   - Authenticated role: full SELECT on own orders, own customer record, own addresses
   - Service role: full access (that's what we use in admin API routes)
3. Generate supabase/migrations/0003_seed_data.sql
   - All vendor rows including the Home/Garage row with is_self_fulfilled=true
   - The 12 brands we know from the BC export (Big Train, Dr. Smoothie, Mocafe, etc.)
   - The top-level categories (Teas & Chai, Cocoa, Frappés, Oatmeal, Smoothies, Syrups)
   - Default settings rows from 3.1-schema.md (tax.enabled=false, shipping thresholds, etc.)
4. Apply all three migrations against the Supabase project (use the Supabase CLI or ask me to paste them in the SQL editor)

Before writing SQL, summarize:
- Total number of tables you'll create
- Any tables where you're uncertain about a design choice
- Any place the spec is ambiguous

Wait for my approval before generating migrations.
```

## Definition of Done
- [ ] All tables visible in Supabase dashboard
- [ ] Enums all defined
- [ ] FK constraints in place (verify by looking at any child table's schema)
- [ ] RLS enabled on all tables that need it
- [ ] Vendor table has a Home/Garage row with `is_self_fulfilled=true`
- [ ] Running `SELECT * FROM vendors` returns all 12 seeded vendors

---

# PHASE 2 — Product catalog migration (1-2 hrs)

**Goal:** The 122 visible products from BigCommerce are in Supabase with correct pricing, slugs (matching old BC URLs for SEO), and category assignments.

## Prompt

```
Phase 2 — migrate the 122 visible products from BigCommerce export into Supabase.

Read lcg-spec/06-migration/6.1-migration-plan.md and lcg-spec/references/bigcommerce/README.md first.

Source file: lcg-spec/references/bigcommerce/products-export.csv (158 rows, 122 with Product Visible? = Y)

Tasks:
1. Write a one-shot migration script at scripts/migrate-products.ts that:
   - Reads products-export.csv
   - Filters to rows where "Product Visible?" = Y
   - Matches the "Brand Name" column to our seeded brands table (insert new brand if missing)
   - Matches Category column to our categories (skip for now if it's a deep path; we can fix categories manually after)
   - Determines supplier from SKU prefix or brand (BT.* → Kerry Foodservice or Houston's — flag these as "Houston's" by default, Jeff can reassign in admin)
   - Preserves the BigCommerce slug from the "Product URL" column (important for SEO redirects)
   - Downloads product images from the "Product Image File - 1" through "- 7" columns and uploads to Supabase Storage under bucket "products/"
   - Inserts each row into products table + product_images table
   - Logs a summary at the end: how many migrated, how many skipped, reasons
2. Run the script once against the dev database
3. Show me the output summary

Before writing the script, tell me:
- How you'll handle the Category column (it's nested like "Brand Names/Big Train;Frappe Mixes/..." — delimiter is semicolon, path separator is slash)
- Whether you want to download images first or link to BC's CDN temporarily
- Any rows that look problematic (malformed prices, missing required fields)

Wait for my approval.
```

## Definition of Done
- [ ] 122 (or close) products in Supabase
- [ ] Running `SELECT name, slug, retail_price FROM products LIMIT 20` returns real data
- [ ] Each product has at least one image linked (Supabase Storage or original BC URL)
- [ ] Big Train, Dr. Smoothie, and Mocafe each have 20+ products assigned
- [ ] Every product has a `preferred_vendor_id` set (even if defaulted to Houston's — Jeff will fix in admin)

---

# PHASE 3 — Public storefront (2-3 hrs)

**Goal:** Homepage, category pages, product detail pages, cart — all working, using real data from Supabase. Matches the approved mockup.

## Prompt

```
Phase 3 — public-facing storefront pages. Build it at the v5 cinematic design level, not a bare-bones prototype.

CRITICAL: Before writing a single line of JSX, read these files in full:
1. lcg-spec/01-context/1.3-design-system.md — the authoritative visual system (tokens, components, animations, page templates)
2. lcg-spec/01-context/1.2-brand-and-design.md — brand voice and positioning context

Everything in 1.3 is non-negotiable. If you want to deviate, stop and re-read.

=== FONT SETUP (do first) ===

In app/layout.tsx, load Fraunces and JetBrains Mono via next/font/google:

import { Fraunces, JetBrains_Mono } from 'next/font/google';
const fraunces = Fraunces({ subsets: ['latin'], weight: ['300','400','500','600'], style: ['normal','italic'], variable: '--font-display', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['300','400','500'], variable: '--font-mono', display: 'swap' });

Apply both variables on the <html> element. NEVER use Inter, Roboto, or system fonts anywhere.

=== COLOR TOKENS (do second) ===

In app/globals.css, define every CSS variable from 1.3-design-system.md's "Color System" section. Use these exact hex values — do not round or substitute:
- Inks: #1A110A / #2E1F13 / #4A3722 / #7A6448
- Papers: #F6EEDE / #EDE2CB / #E0D3B6 / #FCF6E8
- Brand: #7A3B1B / #4E2410 / #2E1205
- Accents: #C14828 (accent) / #B88A48 (gold) / #D4A961 (gold bright)
- Rules: rgba(26, 17, 10, 0.14) and rgba(26, 17, 10, 0.32)
- Easing: cubic-bezier(0.2, 0.8, 0.2, 1) named --ease-out

=== DESIGN SYSTEM COMPONENTS (build in this order) ===

Build these under components/design-system/ before building any page:

1. <Reveal /> — IntersectionObserver-based scroll reveal component (exact code in 1.3-design-system.md)
2. <TopRail /> — black strip with Est. MMIII, quality marks, issue number
3. <Nav /> — 3-column grid, cream bg, drawing-underline hover on links
4. <Ticker items={string[]} /> — infinite-scroll marquee, 40s linear, ✺ separators in gold
5. <SectionHead numeral="I" eyebrow="The Departments" title="Shop by {italic}category{/italic}." link="View All" />
6. <ProductCard product={...} /> — lift-on-hover, dual shadow, image zoom, SKU overlay, "Just In" sticker, italic price with floating cents, ink-fill Add button
7. <CategoryTile category={...} /> — image top with warm grade + radial overlay, number + italic name + count body
8. <BrandRow brand={...} /> — italic 22px name + meta; hover draws left accent bar and slides right
9. <StoryBlock /> — dark ink bg, photo left, content right, drop-cap W, signature
10. <B2BBand /> — deep brown, gold double-rule, glass inset panel with numbered list + phone
11. <Footer /> — 4-column, gold gradient top border, italic serif newsletter, mono trust badges, issue number
12. <Button variant="solid|outline|outline-gold" arrow> — with hover overlay-slide animation

Every hover and transition follows the exact specifications in 1.3's "Hover transitions" section. Use --ease-out for all easings. Durations: 0.25s for small UI (buttons, links), 0.35s for cards, 0.7-0.8s for image zooms.

=== PAGE-LOAD ANIMATIONS ===

Hero elements get staggered fade-up via .stagger-1, .stagger-2, .stagger-3 etc. classes (animation delays 0.10s, 0.25s, 0.40s, 0.55s).

Below-the-fold sections use the <Reveal delay={N}> wrapper — each section's content staggers when scrolled into view.

The hero image uses .scale-in (scaleIn keyframe from 1.3).

=== IMAGE HANDLING ===

Every photograph gets the warm color grading from 1.3's "Image Handling" section. Apply the .img-warm, .img-product, .img-hero, .img-story filters per image context.

For v1 product imagery: use the Supabase Storage URLs populated in Phase 2. For hero/category/story imagery: use Unsplash query-based URLs as placeholders, then swap in Jeff's real photos post-launch. Every image must have meaningful alt text.

Serve through next/image with explicit width/height to prevent layout shift.

=== PAGES TO BUILD (in order) ===

Each page uses a template from 1.3-design-system.md's "Page Templates" section.

1. app/page.tsx — homepage
   Layout: TopRail → Nav → Hero (big split, 1.15 : 1, asymmetric) → Ticker → Categories (6-col, images-on-top) → New Arrivals (4-col product grid, paper-2 bg with 45deg texture) → Story (dark ink, cinematic, 1 : 1.15 split) → Brands Directory (4-col, italic names) → B2B Band → Footer
   Copy: use the v5 mockup copy verbatim (hero headline with italic "kitchens" and gold &, "The pantry for cafés, kitchens & home.", etc.)

2. app/shop/page.tsx — all products with filters (CatalogPage template)
   - PageHeader eyebrow "§ SHOP" / h1 "All products."
   - FilterBar sticky: brand dropdown, category dropdown, price range, in-stock toggle
   - ProductGrid with staggered fade-up on load
   - Pagination or "Load more" button (outline style)

3. app/shop/[category-slug]/page.tsx — category landing (CatalogPage template)
   - PageHeader with category name italicized, roman numeral for the category
   - Same filters + grid

4. app/brand/[brand-slug]/page.tsx — brand landing (CatalogPage template)
   - PageHeader: brand name in italic display-2, founding year under it, item count
   - Product grid

5. app/product/[slug]/page.tsx — product detail (ProductDetailPage template)
   - Breadcrumb in mono
   - 60/40 split: image gallery / product info
   - Info: brand mono, name display-2 with italic accent, SKU mono, italic price, pack-size selector, quantity, Add to Cart solid
   - DescriptionBlock: 2-column with mono section labels
   - RelatedProducts: 4-col grid

6. app/cart/page.tsx — cart (CartPage template)
   - PageHeader "Your cart"
   - 70/30 split: line items / summary
   - Line items: compact horizontal cards with thumbnail + brand-name + qty stepper + price
   - Summary sticky, volume pricing badge if ≥$400
   - Use Zustand with persist middleware for cart state (localStorage)

7. app/for-business/page.tsx — B2B landing
   - Reuse the B2BBand component at hero size
   - Below: testimonial section with 3 real café quotes (placeholder for now, real ones later)
   - Volume pricing tier display ($400 / $700 thresholds)
   - Contact form at bottom

=== WHAT NOT TO DO ===

- Do NOT use Tailwind default colors (bg-amber-600, text-stone-800, etc.). Use the CSS variables.
- Do NOT use Inter, Roboto, or system-ui. Fraunces + JetBrains Mono only.
- Do NOT round product cards. Sharp rectangles.
- Do NOT add emojis anywhere.
- Do NOT use icon libraries (Lucide, Heroicons) for decorative icons. Use CSS characters (→, ✺, ◆, №, §) or custom SVGs for functional icons only.
- Do NOT use gradient backgrounds on buttons or CTAs — flat colors only.
- Do NOT use box-shadow on cards in resting state. Only on hover. The resting aesthetic is flat.
- Do NOT add glows, pulses, or bouncing animations. The one exception is the single "live" dot (opacity pulse) on the hero image overlay.
- Do NOT add scroll-jacking or smooth-scroll libraries.
- Do NOT skip the color grading on images. Every image gets a filter.
- Do NOT ship pages that look like v3 or v4 mockups. The target is v5 cinematic.

=== DELIVERABLES BEFORE YOU WRITE CODE ===

Show me:
1. Your component tree for the homepage (list every component you'll import and where)
2. The exact globals.css content (all CSS variables + keyframes + utility classes)
3. Your next/font setup in app/layout.tsx
4. Confirmation you've read 1.3-design-system.md in full

Wait for my approval before building components.
```

## Definition of Done
- [ ] **Fraunces and JetBrains Mono fonts actually load** (not falling back to system fonts — inspect the rendered page)
- [ ] Every headline on every page has one italic accent word in `--color-brand-deep`
- [ ] Every section has a Roman numeral + eyebrow in the header
- [ ] Homepage hero matches the v5 mockup: asymmetric split, big display-1 type, staggered fade-up animations on load
- [ ] Ticker strip scrolls infinitely at 40s loop with ✺ separators
- [ ] Product cards: lift + dual shadow + image zoom on hover — all four hover effects fire together in 0.35s
- [ ] Brand rows: left accent bar draws + row slides right 6px on hover
- [ ] Images have the warm color grading filters applied (confirm saturate/contrast values in devtools)
- [ ] Nav link underlines draw right-to-left on hover
- [ ] `→` arrows kick out 4px on button hover
- [ ] Below-the-fold sections use `<Reveal>` wrapper for scroll-triggered fade-up
- [ ] Zero instances of Inter, Roboto, or system-ui anywhere in the codebase
- [ ] Zero Tailwind default colors (amber-600, stone-800, etc.) — only CSS variables
- [ ] Zero emoji characters anywhere in rendered output
- [ ] Zero rounded corners on product cards (sharp rectangles)
- [ ] Category pages, brand pages, product detail, cart, For Business all look like they're from the same site (same tokens, same components, same rhythm)
- [ ] Click from category → product → cart without any jarring style shifts
- [ ] Free shipping threshold logic works ($70+ continental, $25 surcharge HI/AK)
- [ ] Volume pricing badge shows in cart summary when subtotal ≥ $400
- [ ] Mobile: hero stacks, hero image loads first, nav collapses to hamburger, product grid goes 2-col then 1-col
- [ ] Reduced motion respected (`prefers-reduced-motion` disables animations)
- [ ] No horizontal scroll on any page at any breakpoint
- [ ] Lighthouse Performance score ≥ 85 on homepage (desktop)

---

# PHASE 4 — Checkout + Auth.net (2-3 hrs, the hardest phase)

**Goal:** Customer can complete a real purchase. Auth.net sandbox captures payment, order lands in Supabase, customer + Jeff both get emails.

## Prompt

```
Phase 4 — checkout flow with Auth.net Accept.js integration.

Read lcg-spec/04-features/4.1-checkout-and-payment.md end to end. This is the most important file in the project.

Tasks:
1. app/checkout/page.tsx — 4-step checkout
   - Step 1: Shipping address (address form; offer "use existing" if logged in)
   - Step 2: Shipping method (free/flat/HI-AK surcharge per shipping rules)
   - Step 3: Payment (Accept.js tokenization — never touch raw card data)
   - Step 4: Review + submit
2. app/api/checkout/create-intent/route.ts — reserves order_number, returns cart totals
3. app/api/checkout/submit/route.ts — creates order row, runs Auth.net auth_capture via @authorizenet/authnet-sdk, stores transaction_id, sends emails
4. lib/authnet/client.ts — Accept.js server utilities
5. lib/tax/calculate.ts — stub that returns $0 per spec (we're zero-tax v1)
6. lib/shipping/calculate.ts — apply the spec rules
7. lib/email/templates/order-confirmation.tsx — React Email template
8. lib/email/templates/admin-new-order.tsx — React Email template (internal notification to jeff@lacostagourmet.com)

Auth.net behavior per spec:
- Accept.js tokenizes the card in the browser → we get an opaqueData payload
- Server calls authCaptureTransaction with opaqueData
- If AFDS flags it for review: store with status=payment_held, email Jeff with "Order needs review"
- If approved: status=paid, fulfillment_status=unfulfilled
- If declined: don't create the order, return error to checkout page

Emails to send (via Resend):
- To customer: order confirmation with order number, items, totals, shipping address, payment receipt
- To Jeff (jeff@lacostagourmet.com): "New order LCG-NNNN — $XXX.XX — [N items]"

Use Auth.net SANDBOX credentials from my .env.local. Do NOT touch production keys.

Before coding, show me:
- Your state machine for the checkout page (what state means what UI)
- How you'll handle the Accept.js iframe + tokenization flow
- Your error handling for declined cards vs network failures vs AFDS holds

Wait for my approval.
```

## Definition of Done
- [ ] Place a test order end-to-end with Auth.net test card `4242424242424242`
- [ ] Order appears in Supabase orders table with all the right fields
- [ ] Customer receives confirmation email
- [ ] Jeff receives admin notification email
- [ ] Try a test AFDS hold card (`4000000000000259` I think — verify per Auth.net sandbox docs) → order should land with status=payment_held
- [ ] Try a declined card → no order created, error shown to user

---

# PHASE 5 — Customer accounts + order history (1-2 hrs)

**Goal:** Customer can log in (magic link OR password), see their past orders (including migrated BC history), reorder with one click.

## Prompt

```
Phase 5 — customer authentication and account pages.

Read lcg-spec/04-features/4.4-customer-account.md first, AND lcg-spec/01-context/1.3-design-system.md for the AccountPage template.

All account/login pages use the v5 design system tokens, components, and animations from Phase 3. Reuse <Nav>, <Footer>, <Button>, <Reveal>, <SectionHead>. Do NOT create new visual patterns.

Tasks:
1. Migrate the 6,337 customers from lcg-spec/references/bigcommerce/customers-export.xml
   - Write scripts/migrate-customers.ts
   - Parse the XML, insert each customer into our customers table
   - Set needs_password_reset=true on all of them
   - Insert all their addresses into customer_addresses
2. Set up Supabase Auth with:
   - Email + password signup + login
   - Magic link login (Supabase Auth's OTP flow)
   - For migrated customers: first login uses magic link, then prompts them to set a password
3. Pages to build:
   - app/login/page.tsx (with tabs for Magic Link / Password)
   - app/signup/page.tsx
   - app/account/page.tsx — dashboard (hello, recent orders, addresses)
   - app/account/orders/page.tsx — full order history including migrated BC orders
   - app/account/orders/[id]/page.tsx — order detail with reorder button
   - app/account/addresses/page.tsx — manage saved addresses
4. Also migrate BC order history (3,139 orders from orders-export.csv)
   - Write scripts/migrate-orders.ts
   - Set orders.source='migrated'
   - Parse Product Details field per the reference README
   - Match orders to customers by email
   - Set status based on BC status (completed → 'paid', shipped → fulfillment_status='shipped')
5. Quick reorder button on past orders — clones the line items into a new cart

Edge cases to handle:
- Customer exists in BC data but never completed signup on new site → needs_password_reset=true, first login is magic link only
- Customer tries to sign up with email that exists in migrated data → detect, send "welcome back" magic link instead of creating dup

Before you code:
- Tell me your approach for the "migrated customer first login" flow
- Confirm what happens if a migrated customer never logs in — does their old order history stay tied to their email forever?

Wait for my approval.
```

## Definition of Done
- [ ] 6,337 customers visible in Supabase customers table
- [ ] 3,139 orders visible in Supabase orders table with source='migrated'
- [ ] Sign up with new email works
- [ ] Log in with magic link works
- [ ] Customer with migrated data can log in via magic link and see their order history
- [ ] Reorder button works (repopulates cart with old items)

---

# PHASE 6 — Admin dashboard (3-4 hrs, biggest phase)

**Goal:** Jeff can log in, see orders, send vendor emails, paste tracking, manage products, view finance dashboards. This is the phase that makes Jeff's life better.

## Prompt

```
Phase 6 — admin dashboard.

Read lcg-spec/04-features/4.3-admin-dashboard.md, lcg-spec/04-features/4.2-vendor-fulfillment.md, AND lcg-spec/01-context/1.3-design-system.md (AdminPage template section).

Admin uses the SAME design system as the storefront — Fraunces + JetBrains Mono, warm palette, italic accents on headings, mono labels, catalog numbering on section heads. Admin is denser than the storefront (more paper-2 backgrounds, tighter spacing, heavier use of monospace for data) but uses identical components. Do NOT build a separate visual language for admin.

Admin-specific adjustments permitted:
- Denser spacing (52-40px between sections instead of 72-56)
- More tabular data views (mono for numbers, serif for labels)
- No hero sections, no marketing copy
- Action buttons follow the same solid/outline variants
- Data density over whitespace

Admin sections still need:
- Staggered fade-up on initial load (stagger-1 through stagger-4 on dashboard cards)
- <Reveal> for scroll-in
- <SectionHead> with roman numerals on each tab
- <Button> component (never raw <button> tags)

All admin routes live under app/admin/. Protect with middleware that checks if user is in a hardcoded admin email list (asher@... and jeff@lacostagourmet.com) — real role-based permissions come in v2.

Tabs/sections to build (Jeff's primary workflow):

1. app/admin/page.tsx — Today dashboard
   - Today's orders count + revenue
   - Pending vendor emails (needs action)
   - Pending tracking (waiting on supplier)
   - This week vs. last week sparkline

2. app/admin/orders/page.tsx — All orders table
   - Filterable by status, date range, customer
   - Click row → order detail

3. app/admin/orders/[id]/page.tsx — THE most important screen
   - Implement the layout from 4.2 exactly
   - Group line items by vendor (supplier groups as cards)
   - For each supplier group: show editable email preview + PO number field + Send button
   - For Home/Garage group: show "Ship Yourself" section with tracking input
   - Tracking paste-back UI
   - Payment info panel with Auth.net transaction details + refund button

4. app/admin/ship-yourself/page.tsx — queue of all orders with Home/Garage items
   - Shows order number, customer, items, age
   - Click → goes to order detail

5. app/admin/products/page.tsx — product management
   - Table of all products, filterable by brand/supplier/status
   - Click → edit page
   - Bulk import CSV (for when vendors send updated price sheets)

6. app/admin/products/[id]/page.tsx — edit product
   - All fields per schema
   - CRITICAL: Supplier dropdown (all vendors from vendors table, alphabetized, Home/Garage at bottom)
   - Image manager

7. app/admin/vendors/page.tsx — vendor management
   - Table with name, is_self_fulfilled, email, template preview
   - Edit page lets Jeff write his email template per vendor

8. app/admin/finance/page.tsx — finance dashboards
   - Daily/weekly/monthly revenue
   - Per-brand, per-vendor, per-product revenue
   - Fees & refunds summary
   - "Export to QuickBooks" button (generates a CSV per the spec)

9. app/admin/settings/page.tsx
   - Shipping rules
   - Auto-send toggle (default OFF)
   - Tax settings (disabled, ready for Phase 2)

API routes under app/admin/api/:
- POST /admin/api/vendor-orders/[id]/send — sends email via Gmail API
- POST /admin/api/vendor-orders/[id]/tracking — updates tracking + triggers customer email
- POST /admin/api/orders/[id]/refund — voids or refunds via Auth.net
- GET /admin/api/finance/summary — for the dashboards

Gmail API setup:
- Use OAuth2 with Jeff's refresh token (he'll provide app password OR I'll walk him through creating an OAuth app)
- Send FROM jeff@lacostagourmet.com (not from Resend)
- Store sent message IDs on vendor_orders.email_message_id

This phase is big. Do it in two passes:
Pass 1: Orders + vendor email sending (the core workflow)
Pass 2: Products, vendors, finance, settings

Before you start Pass 1, show me your state management approach for the order detail page — it has a lot of interactive pieces (re-assigning line items, editing email, sending, pasting tracking).

Wait for my approval.
```

## Definition of Done
- [ ] You can log in as jeff@lacostagourmet.com and see the admin
- [ ] You can click into a test order, see vendor groups, edit the email, send it (to a test address)
- [ ] Paste tracking → customer email fires via Resend
- [ ] "Ship Yourself" queue shows orders with Home/Garage items
- [ ] Products page lists all 122 products with correct supplier assignments
- [ ] Finance page shows revenue numbers that reconcile against the orders table
- [ ] CSV export downloads with the right columns

---

# PHASE 7 — Deploy to staging (1-2 hrs)

**Goal:** Real URL, real SSL, real database, everyone can test before we touch lacostagourmet.com.

## Prompt

```
Phase 7 — deploy to staging on Orange Website VPS.

Read lcg-spec/07-launch/7.1-launch-plan.md first.

Tasks:
1. Set up VPS (Ubuntu 22.04):
   - Install Node 20 LTS, pnpm, PM2, Nginx, Certbot
   - Create deploy user, set up SSH keys
2. Clone the repo to /home/deploy/lacostagourmet
3. Install deps, create .env.production with real credentials
4. Build: pnpm build
5. Start with PM2: pm2 start npm --name lacostagourmet -- start
6. Configure Nginx as reverse proxy
7. Create a staging subdomain: staging.lacostagourmet.com (A record on Cloudflare)
8. Certbot for SSL
9. Set up log rotation, daily backups of Supabase
10. Write a deploy.sh script for future pushes (git pull, pnpm install, pnpm build, pm2 reload)

Use a separate Supabase project for staging (lacostagourmet-staging) — do not share with dev.
Copy the production migrations into staging, seed with dev data.

Before you start, confirm:
- The VPS is provisioned and you have SSH access
- staging.lacostagourmet.com is a domain you can point DNS for
- You have production Auth.net credentials ready (or are using sandbox for staging)

Wait for my approval.
```

## Definition of Done
- [ ] https://staging.lacostagourmet.com loads with valid SSL
- [ ] Homepage works
- [ ] Can complete a test order via Auth.net sandbox
- [ ] Admin login works
- [ ] PM2 process is running, restart-on-crash configured
- [ ] Backups automated

---

# PHASE 8 — Jeff UAT + fixes (1-2 hrs depending)

**Goal:** Jeff uses staging for an hour, breaks things, we fix them.

## What you do
1. Send Jeff the staging URL + his admin credentials
2. Jeff logs in, places 2-3 test orders (sandbox cards), walks through the admin
3. Capture every "that's weird" / "can you change X" / "this doesn't work"
4. Triage: what's launch-blocking vs. nice-to-have
5. Fix launch blockers only. Nice-to-haves go to the retainer backlog.

## Prompt for fixes (adapt as Jeff finds things)

```
Jeff's UAT feedback from staging:

[paste bullet list]

Triage these:
- Launch blockers (must fix before DNS cutover)
- Post-launch fixes (retainer backlog, acknowledge but defer)
- Misunderstandings (features that work correctly but Jeff thinks are broken — explain, don't change)

Then fix only the launch blockers. Show me your triage before fixing anything.
```

---

# PHASE 9 — Production launch (2-3 hrs)

**Goal:** lacostagourmet.com points at the new site. Customers keep buying without disruption.

## Prompt

```
Phase 9 — production launch / DNS cutover.

Read lcg-spec/07-launch/7.1-launch-plan.md's "DNS cutover checklist" section.

Pre-flight:
1. Confirm production Supabase is separate from staging
2. Run all migrations on production Supabase
3. Re-run product + customer + order migrations against production (fresh data)
4. Update .env.production with real Auth.net credentials (Jeff's, not sandbox)
5. Update Gmail API credentials to real Jeff workspace
6. Deploy latest code to VPS using production env
7. Test production with a real $1 order using a real card (refund immediately)

DNS cutover:
1. Lower TTL on lacostagourmet.com A record to 300 seconds (do this 24 hours ahead)
2. Change A record from BigCommerce's IP to our VPS IP
3. Verify propagation via dnschecker.org
4. Verify https://lacostagourmet.com loads our site
5. Verify all old BC URLs redirect via 301 to the new site
6. Place one real order, refund it

Monitor for 72 hours:
- Error rate (Sentry or log tail)
- Order volume (should match historical pattern, not zero)
- Any customer support emails mentioning the site

If something is critically broken: roll back the A record to BigCommerce's IP. That's our undo button.

Before you start, confirm:
- Jeff has pulled his Auth.net production credentials and shared them
- We have a full backup of the current BC site data (products + customers + orders — we already have these exports)
- Jeff is reachable during the cutover (in case customer complaints come fast)

Wait for my approval.
```

## Definition of Done
- [ ] https://lacostagourmet.com resolves to the new site
- [ ] Real payment successfully processed + refunded
- [ ] At least one real customer order comes in organically
- [ ] 48 hours post-launch with no critical issues

---

# PHASE 10 — Handoff + retainer kickoff (30 min)

Once launched:

1. **Send Jeff the launch email** (template below)
2. **Collect final $750 payment**
3. **Set up retainer billing** (monthly Zelle/ACH/whatever Jeff picks)
4. **Move all cleanup tasks to retainer backlog**
5. **Schedule 30-day post-launch check-in**

## Launch email to Jeff

```
Subject: Your new site is live

Grandpa — lacostagourmet.com is now running on the new system.

Everything's working. Your existing customers can log in using the email they used
before (I've set them up with magic link first-time login so no password reset
needed). All your past orders are still in your account.

Your login:
- Site: https://lacostagourmet.com/admin
- Email: jeff@lacostagourmet.com
- First-time login: click "Magic Link" tab, check your email

What to expect in the first week:
- I'll be watching the site closely for 72 hours
- Customers may email asking "did you change your site?" — just reply yes, same products, new system, better experience
- Any customer who had trouble logging in can email and I'll help them

When you have a chance, please send:
- Your Auth.net fraud rules (those 5-6 you told me about) so I can set them up here
- Your vendor email templates as you write them

Final $750 payment is due now (site is in production).

Excited for you, grandpa. Let's get this business back to where it should be.

— Asher
```

---

# PHASE 11 onward — Retainer work

Not in the $1,500 build. Budget for the $300/month retainer:

**Month 1** (free) — stability watch, minor fixes, onboard Jeff to admin workflows

**Month 2+** — ongoing:
- 1-2 blog posts / month (SEO content)
- Google Merchant Center setup + weekly product feed sync
- Google Business Profile optimization (Carlsbad local SEO)
- Vendor price sheet imports as they arrive
- Monthly performance report sent to Jeff
- Minor tweaks and small features

**Phase 2 projects** (priced separately):
- Amazon Storefront integration ($2,500-4,000)
- ShipEngine tracking automation (~$800-1,200 once we see real supplier data)
- Subscribe & save / recurring orders ($1,500-2,500)
- Product reviews system ($800-1,500)

---

# Guardrails: things that will save your ass

## 1. Commit after every phase passes

```
git add -A
git commit -m "Phase N complete: [brief summary]"
git push origin main
```

If a phase goes sideways you can always `git reset --hard HEAD~1` back to a clean state.

## 2. Run the build after every significant change

```
pnpm build
```

A green `pnpm build` is the minimum bar. If it doesn't build, don't move on.

## 3. Never let Claude Code "proceed without confirmation"

Every phase prompt above has "wait for my approval." Honor that. Review the plan before code is written. 5 minutes of planning saves 2 hours of unbuilding wrong code.

## 4. If something feels off, stop

Claude Code will sometimes confidently produce code that doesn't match the spec. If you read output and it feels off, say:

> "Wait. This doesn't match lcg-spec/[file]. Re-read that file and tell me what the right approach is."

Don't let it accumulate. Little drift compounds into rewrites.

## 5. Don't try to do all phases in one marathon

**Phase 0-2: Friday evening (3-4 hrs)** — scaffold + DB + product migration
**Phase 3: Saturday morning (2-3 hrs)** — storefront
**Phase 4: Saturday afternoon (2-3 hrs)** — checkout
**Phase 5-6: Sunday (4-6 hrs)** — accounts + admin
**Phase 7: Sunday evening or Monday (1-2 hrs)** — staging
**Phase 8-9: Monday night or Tuesday morning** — UAT + launch

If you try to do it all in one sitting at 2 AM, you'll ship bugs.

---

# Your personal pre-launch checklist

Before you press go on Phase 9 (production launch), this must all be true:

- [ ] You've completed a full end-to-end order on staging (cart → checkout → pay → email → admin sees it → send vendor email → paste tracking → customer email fires)
- [ ] Jeff has logged in and explored staging for at least 30 minutes
- [ ] Jeff's Auth.net production credentials are in .env.production (NOT sandbox)
- [ ] Gmail API is configured with Jeff's real workspace, not yours
- [ ] All 122 products have a supplier assigned (no NULLs in preferred_vendor_id)
- [ ] At least 10 customer emails have been manually tested to confirm they land in inbox (not spam)
- [ ] Backups are running daily on production Supabase
- [ ] DNS TTL is lowered to 300 seconds at least 24 hours before cutover
- [ ] You have an empty calendar block Monday 9am-12pm PT to watch the launch

Miss any of these and you're gambling on the launch. Hit all of them and it goes smoothly.

---

# Go ship it. Good luck this weekend.
