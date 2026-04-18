# 00 — Elevator Pitch

**What we're building:** a new e-commerce site for La Costa Gourmet (lacostagourmet.com), replacing a BigCommerce Stencil storefront that's been live since 2003.

**Who the customer is:** La Costa Gourmet is a family-owned Carlsbad, California specialty beverage reseller. They sell café supplies — chai mixes, cocoa powders, frappé bases, gourmet syrups, tea, oatmeal, protein powders — to home users and small businesses (cafés, offices, bakeries). All products are made in the USA. All products are dropshipped via email-based order handoff to multiple vendors (primary: Houston's Inc., plus direct relationships with Sunny Sky / Dr. Smoothie, Mocafe, David Rio, Monin, Torani, Kerry/Big Train, and others).

**What makes this hard:**

1. **22-year-old SEO** has to be preserved through the rebuild via 301 redirects
2. **Multi-vendor email-based fulfillment** — no API, just grandpa sending emails to vendors with "ship from [warehouse]" instructions
3. **Finance visibility** grandpa wants is real: daily sales, net after Auth.net + Wells Fargo fees, per-product margin, refunds/chargebacks, QuickBooks export
4. **Authorize.net fraud rules** (5-6 AFDS rules) must be respected — orders can be declined, approved, or held for review
5. **Warm mom-and-pop aesthetic** without falling into generic or cute territory — the site needs to still credibly sell to a café buying 10 cases

**Who's building it:** Asher — the owner's grandson. 19, runs multiple startups, built Healthy Aminos (healthyaminolabs.com) on the same stack. Comfortable with Next.js 14 App Router, Supabase, full-stack TypeScript. Uses Claude Code for heavy lifting.

**Budget:** $1K profit to Asher. All infrastructure paid by grandpa. Aggressive weekend timeline. Retainer model proposed for ongoing SEO + Google Merchant Center + maintenance.

**The mental model for every decision:** if Asher gets too busy with his other companies in six months, **grandpa or a freelance Next.js dev can still maintain this site.** Don't build anything too clever. Boring, standard, maintainable > impressive.
