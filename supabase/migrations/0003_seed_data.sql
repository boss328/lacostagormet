-- 0003_seed_data.sql
-- La Costa Gourmet — seed data: vendors, brands, top-level categories, settings.
--
-- Apply AFTER 0001_initial_schema.sql and 0002_rls_policies.sql.
-- Runs as the service role (via the SQL Editor), so RLS is bypassed for inserts.

BEGIN;

-- =============================================================================
-- Vendors — 11 suppliers + Home/Garage self-fulfilled row
-- The "Home/Garage" row (is_self_fulfilled=true) drives the Ship Yourself queue.
-- =============================================================================

INSERT INTO vendors (name, slug, is_self_fulfilled, display_order) VALUES
  ('Houston''s Inc.',   'houstons',        false,  10),
  ('Sunny Sky',         'sunny-sky',       false,  20),
  ('Mocafe',            'mocafe',          false,  30),
  ('David Rio',         'david-rio',       false,  40),
  ('Monin',             'monin',           false,  50),
  ('Torani',            'torani',          false,  60),
  ('Kerry Foodservice', 'kerry',           false,  70),
  ('DaVinci Gourmet',   'davinci-gourmet', false,  80),
  ('iBev Concepts',     'ibev',            false,  90),
  ('Smartfruit',        'smartfruit',      false, 100),
  ('Tiki Breeze',       'tiki-breeze',     false, 110),
  ('Home/Garage',       'home',            true,  999);

-- =============================================================================
-- Brands — 12 manufacturer brands from the BigCommerce export
-- primary_vendor_id is left NULL; Jeff maps brand → supplier via admin UI
-- once vendor rows are reviewed.
-- =============================================================================

INSERT INTO brands (name, slug) VALUES
  ('Big Train',       'big-train'),
  ('Dr. Smoothie',    'dr-smoothie'),
  ('Mocafe',          'mocafe'),
  ('David Rio',       'david-rio'),
  ('Monin',           'monin'),
  ('Torani',          'torani'),
  ('DaVinci Gourmet', 'davinci-gourmet'),
  ('Oregon Chai',     'oregon-chai'),
  ('Upouria',         'upouria'),
  ('Cafe Essentials', 'cafe-essentials'),
  ('Modern Oats',     'modern-oats'),
  ('Smartfruit',      'smartfruit');

-- =============================================================================
-- Categories — 6 top-level. Sub-categories are added later during catalog import.
-- =============================================================================

INSERT INTO categories (name, slug, display_order) VALUES
  ('Teas & Chai',      'teas-and-chai',      10),
  ('Cocoa',            'cocoa',              20),
  ('Frappés',          'frappes',            30),
  ('Oatmeal & Grains', 'oatmeal-and-grains', 40),
  ('Smoothie Bases',   'smoothie-bases',     50),
  ('Syrups & Sauces',  'syrups-and-sauces',  60);

-- =============================================================================
-- Settings — shipping, tax, email, featured.
-- All values are jsonb. See lcg-spec/03-data-model/3.1-schema.md for meaning.
-- =============================================================================

INSERT INTO settings (key, value, description, category) VALUES
  ('shipping.free_threshold',
    '70'::jsonb,
    'Subtotal (USD) at or above which continental-US shipping is free.',
    'shipping'),
  ('shipping.flat_rate_under_threshold',
    '12.99'::jsonb,
    'Flat shipping charge (USD) for continental-US orders under the free threshold.',
    'shipping'),
  ('shipping.hi_ak_surcharge',
    '25'::jsonb,
    'Additional surcharge (USD) for Hawaii and Alaska on top of the flat rate.',
    'shipping'),
  ('vendor_email.auto_send_enabled',
    'false'::jsonb,
    'Master kill switch. When false, vendor emails are drafted but admin must click Send. Ship with false; never default to true.',
    'email'),
  ('tax.enabled',
    'false'::jsonb,
    'When false, calculateTax() returns 0 for every order. V1 default — Jeff''s catalog is non-taxable grocery food. Flip true + wire TaxJar in Phase 2 if needed.',
    'payment'),
  ('tax.nexus_states',
    '["CA"]'::jsonb,
    'States where Jeff has sales-tax nexus. Not actively enforced while tax.enabled=false; here so Phase 2 TaxJar wire-up has the state list ready.',
    'payment'),
  ('featured_products',
    '[]'::jsonb,
    'Array of product UUIDs surfaced on the homepage "featured" block. Populate via admin UI once catalog is imported.',
    'general');

COMMIT;
