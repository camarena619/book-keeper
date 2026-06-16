-- ============================================================================
-- 1099-NEC CONTRACTOR TRACKING
-- ============================================================================
-- Reuses the existing suppliers table (expenses already link via supplier_id)
-- to flag contractors and hold their W-9 details. Adds payer (org) tax info.
-- Tax IDs / EIN are stored AES-256-GCM encrypted (lib/crypto), same as bank
-- numbers — the encryption key never reaches the browser.
-- ============================================================================

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS is_1099          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS legal_name       TEXT,
  ADD COLUMN IF NOT EXISTS tax_id_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS address          TEXT;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ein_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS address       TEXT;

CREATE INDEX IF NOT EXISTS suppliers_1099_idx
  ON public.suppliers (organization_id) WHERE is_1099;
