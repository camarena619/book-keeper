-- ============================================================================
-- MIGRATION: Plaid access-token storage on bank_accounts
-- Version:    20260614500000
-- Purpose:    The init schema's bank_accounts has no column for the Plaid
--             access token. Add one (stored AES-256-GCM encrypted server-side
--             via lib/crypto.ts — never plaintext), plus a last-sync timestamp.
-- ============================================================================

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS plaid_access_token TEXT,   -- encrypted ciphertext
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
