-- ============================================================================
-- FIX: invoice ledger auto-posting
-- ============================================================================
-- Problems addressed:
--  1. CRITICAL: sync_invoice_ledger_entry read NEW.grand_total_cents, which only
--     exists on the invoice_ledger VIEW, not the invoices table. Any sent/paid/
--     overdue transition raised "record new has no field grand_total_cents" and
--     failed. Totals are now computed from invoice_items (same math as the view).
--  2. Revenue was stamped with CURRENT_DATE (status-change day) instead of the
--     invoice's own date -> wrong period in date-range P&L. Now uses created_at.
--  3. Sales tax was credited to Revenue. Tax collected is a liability, not income.
--     A new 'Sales Tax Payable' (2100) account now holds it; revenue = subtotal.
-- ============================================================================

-- 1. Add Sales Tax Payable to the chart-of-accounts seed for NEW organizations.
CREATE OR REPLACE FUNCTION public.seed_organization_accounts()
RETURNS TRIGGER AS $$
BEGIN
  -- Assets
  INSERT INTO public.accounts (organization_id, code, name, type, is_system) VALUES
    (NEW.id, '1010', 'SVB Operations Checking', 'asset', TRUE),
    (NEW.id, '1200', 'Accounts Receivable', 'asset', TRUE);
  -- Liabilities
  INSERT INTO public.accounts (organization_id, code, name, type, is_system) VALUES
    (NEW.id, '2000', 'Accounts Payable', 'liability', TRUE),
    (NEW.id, '2100', 'Sales Tax Payable', 'liability', TRUE);
  -- Equity
  INSERT INTO public.accounts (organization_id, code, name, type, is_system) VALUES
    (NEW.id, '3000', 'Retained Earnings', 'equity', TRUE),
    (NEW.id, '3100', 'Owner''s Equity', 'equity', TRUE);
  -- Revenue
  INSERT INTO public.accounts (organization_id, code, name, type, is_system) VALUES
    (NEW.id, '4000', 'Operating Revenue (Invoices)', 'revenue', TRUE);
  -- Expenses
  INSERT INTO public.accounts (organization_id, code, name, type, is_system) VALUES
    (NEW.id, '5010', 'Rent Expense', 'expense', TRUE),
    (NEW.id, '5020', 'Software/SaaS Subscription Expense', 'expense', TRUE),
    (NEW.id, '5030', 'Materials & Supplies Expense', 'expense', TRUE),
    (NEW.id, '5090', 'Miscellaneous Expense', 'expense', TRUE);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Backfill Sales Tax Payable for organizations that predate this migration.
INSERT INTO public.accounts (organization_id, code, name, type, is_system)
SELECT o.id, '2100', 'Sales Tax Payable', 'liability', TRUE
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.accounts a
  WHERE a.organization_id = o.id AND a.code = '2100'
);

-- 3. Corrected invoice auto-posting.
CREATE OR REPLACE FUNCTION public.sync_invoice_ledger_entry()
RETURNS TRIGGER AS $$
DECLARE
  _ar_account_id     UUID;
  _rev_account_id    UUID;
  _bank_account_id   UUID;
  _tax_account_id    UUID;
  _journal_entry_id  UUID;
  _subtotal_cents    BIGINT;
  _tax_cents         BIGINT;
  _grand_total_cents BIGINT;
  _invoice_date      DATE;
BEGIN
  -- Always rebuild this invoice's entries from scratch.
  DELETE FROM public.journal_entries
  WHERE reference_source = 'invoice' AND reference_id = COALESCE(NEW.id, OLD.id);

  -- Nothing to post for deletes, drafts, or cancelled invoices.
  IF TG_OP = 'DELETE' OR NEW.status IN ('draft', 'cancelled') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Compute totals from line items (mirrors the invoice_ledger view).
  SELECT COALESCE(SUM(total_cents), 0) INTO _subtotal_cents
  FROM public.invoice_items WHERE invoice_id = NEW.id;
  _tax_cents := ROUND(_subtotal_cents::numeric * NEW.tax_rate_basis_points::numeric / 10000.0);
  _grand_total_cents := _subtotal_cents + _tax_cents;

  -- Skip zero-value invoices (avoids empty/zero journal entries).
  IF _grand_total_cents = 0 THEN
    RETURN NEW;
  END IF;

  _invoice_date := NEW.created_at::date;

  -- Resolve the system accounts.
  SELECT id INTO _ar_account_id   FROM public.accounts WHERE organization_id = NEW.organization_id AND code = '1200';
  SELECT id INTO _rev_account_id  FROM public.accounts WHERE organization_id = NEW.organization_id AND code = '4000';
  SELECT id INTO _bank_account_id FROM public.accounts WHERE organization_id = NEW.organization_id AND code = '1010';
  SELECT id INTO _tax_account_id  FROM public.accounts WHERE organization_id = NEW.organization_id AND code = '2100';

  IF _ar_account_id IS NULL OR _rev_account_id IS NULL OR _bank_account_id IS NULL
     OR (_tax_cents > 0 AND _tax_account_id IS NULL) THEN
    RAISE EXCEPTION 'Organization chart of accounts is incomplete for organization %', NEW.organization_id;
  END IF;

  -- Revenue recognition (sent / overdue / paid): debit A/R for the full amount,
  -- credit Revenue for the subtotal and Sales Tax Payable for the tax.
  IF NEW.status IN ('sent', 'overdue', 'paid') THEN
    INSERT INTO public.journal_entries (organization_id, entry_date, description, reference_source, reference_id)
    VALUES (NEW.organization_id, _invoice_date, 'Invoice ' || NEW.invoice_number || ' finalized', 'invoice', NEW.id)
    RETURNING id INTO _journal_entry_id;

    INSERT INTO public.ledger_lines (journal_entry_id, account_id, entry_type, amount_cents) VALUES
      (_journal_entry_id, _ar_account_id,  'debit',  _grand_total_cents),
      (_journal_entry_id, _rev_account_id, 'credit', _subtotal_cents);

    IF _tax_cents > 0 THEN
      INSERT INTO public.ledger_lines (journal_entry_id, account_id, entry_type, amount_cents) VALUES
        (_journal_entry_id, _tax_account_id, 'credit', _tax_cents);
    END IF;
  END IF;

  -- Cash receipt (paid only): debit checking, credit A/R.
  IF NEW.status = 'paid' THEN
    INSERT INTO public.journal_entries (organization_id, entry_date, description, reference_source, reference_id)
    VALUES (NEW.organization_id, CURRENT_DATE, 'Payment received for Invoice ' || NEW.invoice_number, 'invoice', NEW.id)
    RETURNING id INTO _journal_entry_id;

    INSERT INTO public.ledger_lines (journal_entry_id, account_id, entry_type, amount_cents) VALUES
      (_journal_entry_id, _bank_account_id, 'debit',  _grand_total_cents),
      (_journal_entry_id, _ar_account_id,   'credit', _grand_total_cents);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
