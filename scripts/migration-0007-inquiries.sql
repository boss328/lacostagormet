-- 0007_inquiries.sql
-- Business inquiry inbox + IP-based rate limiting.
--
-- Table: inquiries — each /for-business form submission, plus the admin
-- triage status (new → contacted → archived).
-- Table: inquiry_rate_limit — per-IP counter so a single bot can't flood
-- Jeff's inbox. Window is one hour, max 3 attempts per IP.
--
-- Apply in the Supabase SQL Editor before deploying the inquiry flow.

BEGIN;

CREATE TABLE IF NOT EXISTS inquiries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  business_name    text NOT NULL,
  email            text NOT NULL,
  phone            text,
  volume_estimate  text,
  notes            text,
  status           text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'archived')),
  ip               inet,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inquiries_status_created_at_idx
  ON inquiries(status, created_at DESC);
CREATE INDEX IF NOT EXISTS inquiries_created_at_idx
  ON inquiries(created_at DESC);

CREATE TRIGGER set_updated_at_inquiries BEFORE UPDATE ON inquiries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Per-IP rate limit. Window resets when window_start is older than 1 hour;
-- the API route clears + reseeds the row in that case (see /api/inquiries/submit).
CREATE TABLE IF NOT EXISTS inquiry_rate_limit (
  ip            inet PRIMARY KEY,
  attempt_count int NOT NULL DEFAULT 1,
  window_start  timestamptz NOT NULL DEFAULT now()
);

-- RLS: both tables are admin-only. The form-submit route uses the service
-- role (which bypasses RLS), so we don't need any anon/authenticated
-- policies. Enable RLS to make the default deny explicit.
ALTER TABLE inquiries           ENABLE ROW LEVEL SECURITY;
ALTER TABLE inquiry_rate_limit  ENABLE ROW LEVEL SECURITY;

COMMIT;
