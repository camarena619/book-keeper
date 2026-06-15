-- ============================================================================
-- MIGRATION: Stripe payment link columns on invoices
-- Version:    20260614600000
-- Purpose:    Store the Stripe Payment Link for an invoice so customers can pay
--             online, and let the Stripe webhook reconcile payments back to the
--             invoice (match on stripe_payment_link_id, then mark paid).
-- ============================================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stripe_payment_link_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_link_url TEXT;
