-- ============================================================================
-- MIGRATION: Plaid transaction sync cursor column
-- Version:    20260614700000
-- Purpose:    Add a cursor column to bank_accounts to save state for Plaid's
--             /transactions/sync endpoint, ensuring subsequent fetches only
--             retrieve changes since the last sync.
-- ============================================================================

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS plaid_sync_cursor TEXT;
