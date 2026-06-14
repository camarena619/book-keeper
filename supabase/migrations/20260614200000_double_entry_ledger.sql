-- ============================================================================
-- DOUBLE-ENTRY ACCOUNTING LEDGER SYSTEM MIGRATION
-- ============================================================================

-- 1. Create Core Tables
-- ----------------------------------------------------------------------------

-- Chart of Accounts
CREATE TABLE IF NOT EXISTS public.accounts (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID          NOT NULL REFERENCES public.organizations ON DELETE CASCADE,
  code            TEXT          NOT NULL, -- e.g. '1010', '1200', '4000', '5010'
  name            TEXT          NOT NULL, -- e.g. 'SVB Operations Checking', 'Accounts Receivable'
  type            TEXT          NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  is_system       BOOLEAN       DEFAULT FALSE, -- System accounts cannot be deleted
  created_at      TIMESTAMPTZ   DEFAULT NOW(),
  UNIQUE(organization_id, code)
);

-- Journal Entries
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID          NOT NULL REFERENCES public.organizations ON DELETE CASCADE,
  entry_date      DATE          NOT NULL DEFAULT CURRENT_DATE,
  description     TEXT          NOT NULL,
  reference_source TEXT         CHECK (reference_source IN ('invoice', 'expense', 'manual')),
  reference_id    UUID,         -- ID of invoice or expense
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- Ledger Lines (individual debits and credits)
CREATE TABLE IF NOT EXISTS public.ledger_lines (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID         NOT NULL REFERENCES public.journal_entries ON DELETE CASCADE,
  account_id       UUID         NOT NULL REFERENCES public.accounts ON DELETE RESTRICT,
  entry_type       TEXT         NOT NULL CHECK (entry_type IN ('debit', 'credit')),
  amount_cents     BIGINT       NOT NULL CHECK (amount_cents >= 0),
  created_at       TIMESTAMPTZ  DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_lines ENABLE ROW LEVEL SECURITY;

-- 2. Define RLS Policies
-- ----------------------------------------------------------------------------

-- Accounts policies
CREATE POLICY "accounts_select" ON public.accounts
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "accounts_insert" ON public.accounts
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin']));

CREATE POLICY "accounts_update" ON public.accounts
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']));

CREATE POLICY "accounts_delete" ON public.accounts
  FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']) AND NOT is_system);

-- Journal entries policies
CREATE POLICY "journal_select" ON public.journal_entries
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "journal_insert" ON public.journal_entries
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'editor']));

CREATE POLICY "journal_update" ON public.journal_entries
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin', 'editor']));

CREATE POLICY "journal_delete" ON public.journal_entries
  FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner', 'admin']));

-- Ledger lines policies
CREATE POLICY "ledger_lines_select" ON public.ledger_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.journal_entries je
      WHERE je.id = journal_entry_id
        AND public.is_org_member(je.organization_id)
    )
  );

CREATE POLICY "ledger_lines_insert" ON public.ledger_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.journal_entries je
      WHERE je.id = journal_entry_id
        AND public.has_org_role(je.organization_id, ARRAY['owner', 'admin', 'editor'])
    )
  );

CREATE POLICY "ledger_lines_update" ON public.ledger_lines
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.journal_entries je
      WHERE je.id = journal_entry_id
        AND public.has_org_role(je.organization_id, ARRAY['owner', 'admin', 'editor'])
    )
  );

CREATE POLICY "ledger_lines_delete" ON public.ledger_lines
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.journal_entries je
      WHERE je.id = journal_entry_id
        AND public.has_org_role(je.organization_id, ARRAY['owner', 'admin'])
    )
  );

-- 3. Double-Entry Balanced Transaction Check Trigger
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_journal_entry_balance()
RETURNS TRIGGER AS $$
DECLARE
  _total_debits BIGINT;
  _total_credits BIGINT;
  _entry_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _entry_id := OLD.journal_entry_id;
  ELSE
    _entry_id := NEW.journal_entry_id;
  END IF;

  -- Skip validation if parent journal entry is being deleted
  IF NOT EXISTS (SELECT 1 FROM public.journal_entries WHERE id = _entry_id) THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(amount_cents), 0) INTO _total_debits FROM public.ledger_lines
  WHERE journal_entry_id = _entry_id AND entry_type = 'debit';

  SELECT COALESCE(SUM(amount_cents), 0) INTO _total_credits FROM public.ledger_lines
  WHERE journal_entry_id = _entry_id AND entry_type = 'credit';

  IF _total_debits <> _total_credits THEN
    RAISE EXCEPTION 'Journal entry (ID: %) is unbalanced. Debits: % cents, Credits: % cents. Debits must equal credits.',
      _entry_id, _total_debits, _total_credits;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER check_journal_entry_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.ledger_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_journal_entry_balance();

-- 4. Chart of Accounts Seeding Trigger
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seed_organization_accounts()
RETURNS TRIGGER AS $$
BEGIN
  -- Assets
  INSERT INTO public.accounts (organization_id, code, name, type, is_system) VALUES
    (NEW.id, '1010', 'SVB Operations Checking', 'asset', TRUE),
    (NEW.id, '1200', 'Accounts Receivable', 'asset', TRUE);
  -- Liabilities
  INSERT INTO public.accounts (organization_id, code, name, type, is_system) VALUES
    (NEW.id, '2000', 'Accounts Payable', 'liability', TRUE);
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

CREATE TRIGGER seed_org_accounts_trigger
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_organization_accounts();

-- 5. Auto-Posting Invoices & Expenses Triggers
-- ----------------------------------------------------------------------------

-- Invoices Auto-Post Trigger
CREATE OR REPLACE FUNCTION public.sync_invoice_ledger_entry()
RETURNS TRIGGER AS $$
DECLARE
  _ar_account_id UUID;
  _rev_account_id UUID;
  _bank_account_id UUID;
  _journal_entry_id UUID;
BEGIN
  -- 1. Remove existing journal entries associated with this invoice (if any)
  DELETE FROM public.journal_entries
  WHERE reference_source = 'invoice' AND reference_id = COALESCE(NEW.id, OLD.id);

  -- 2. Skip if deleting or status is draft
  IF TG_OP = 'DELETE' OR NEW.status = 'draft' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- 3. Resolve accounts
  SELECT id INTO _ar_account_id FROM public.accounts WHERE organization_id = NEW.organization_id AND code = '1200';
  SELECT id INTO _rev_account_id FROM public.accounts WHERE organization_id = NEW.organization_id AND code = '4000';
  SELECT id INTO _bank_account_id FROM public.accounts WHERE organization_id = NEW.organization_id AND code = '1010';

  IF _ar_account_id IS NULL OR _rev_account_id IS NULL OR _bank_account_id IS NULL THEN
    RAISE EXCEPTION 'Organization default chart of accounts is missing for organization %', NEW.organization_id;
  END IF;

  -- 4. Post entries
  IF NEW.status IN ('sent', 'overdue') THEN
    -- Recognize accounts receivable and revenue
    INSERT INTO public.journal_entries (organization_id, entry_date, description, reference_source, reference_id)
    VALUES (NEW.organization_id, CURRENT_DATE, 'Invoice ' || NEW.invoice_number || ' finalized', 'invoice', NEW.id)
    RETURNING id INTO _journal_entry_id;

    INSERT INTO public.ledger_lines (journal_entry_id, account_id, entry_type, amount_cents) VALUES
      (_journal_entry_id, _ar_account_id, 'debit', NEW.grand_total_cents),
      (_journal_entry_id, _rev_account_id, 'credit', NEW.grand_total_cents);

  ELSIF NEW.status = 'paid' THEN
    -- Recognize revenue
    INSERT INTO public.journal_entries (organization_id, entry_date, description, reference_source, reference_id)
    VALUES (NEW.organization_id, CURRENT_DATE, 'Invoice ' || NEW.invoice_number || ' finalized', 'invoice', NEW.id)
    RETURNING id INTO _journal_entry_id;

    INSERT INTO public.ledger_lines (journal_entry_id, account_id, entry_type, amount_cents) VALUES
      (_journal_entry_id, _ar_account_id, 'debit', NEW.grand_total_cents),
      (_journal_entry_id, _rev_account_id, 'credit', NEW.grand_total_cents);

    -- Cash receipt: Debit cash/checking, credit accounts receivable
    INSERT INTO public.journal_entries (organization_id, entry_date, description, reference_source, reference_id)
    VALUES (NEW.organization_id, CURRENT_DATE, 'Payment received for Invoice ' || NEW.invoice_number, 'invoice', NEW.id)
    RETURNING id INTO _journal_entry_id;

    INSERT INTO public.ledger_lines (journal_entry_id, account_id, entry_type, amount_cents) VALUES
      (_journal_entry_id, _bank_account_id, 'debit', NEW.grand_total_cents),
      (_journal_entry_id, _ar_account_id, 'credit', NEW.grand_total_cents);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER sync_invoice_ledger_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_invoice_ledger_entry();


-- Expenses Auto-Post Trigger
CREATE OR REPLACE FUNCTION public.sync_expense_ledger_entry()
RETURNS TRIGGER AS $$
DECLARE
  _bank_account_id UUID;
  _expense_account_id UUID;
  _journal_entry_id UUID;
  _expense_code TEXT;
BEGIN
  -- 1. Remove existing journal entries associated with this expense
  DELETE FROM public.journal_entries
  WHERE reference_source = 'expense' AND reference_id = COALESCE(NEW.id, OLD.id);

  -- 2. Skip if deleting or status is not approved
  IF TG_OP = 'DELETE' OR NEW.status <> 'approved' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- 3. Map expense category to COA code
  CASE NEW.category
    WHEN 'rent' THEN _expense_code := '5010';
    WHEN 'software' THEN _expense_code := '5020';
    WHEN 'materials' THEN _expense_code := '5030';
    ELSE _expense_code := '5090';
  END CASE;

  -- 4. Resolve accounts
  SELECT id INTO _expense_account_id FROM public.accounts WHERE organization_id = NEW.organization_id AND code = _expense_code;
  SELECT id INTO _bank_account_id FROM public.accounts WHERE organization_id = NEW.organization_id AND code = '1010';

  IF _expense_account_id IS NULL OR _bank_account_id IS NULL THEN
    RAISE EXCEPTION 'Default accounts for checking or expense % are missing for organization %', _expense_code, NEW.organization_id;
  END IF;

  -- 5. Post approved expense: Debit expense account, Credit operations checking
  INSERT INTO public.journal_entries (organization_id, entry_date, description, reference_source, reference_id)
  VALUES (NEW.organization_id, NEW.expense_date::DATE, 'Expense: ' || NEW.title, 'expense', NEW.id)
  RETURNING id INTO _journal_entry_id;

  INSERT INTO public.ledger_lines (journal_entry_id, account_id, entry_type, amount_cents) VALUES
    (_journal_entry_id, _expense_account_id, 'debit', NEW.amount_cents),
    (_journal_entry_id, _bank_account_id, 'credit', NEW.amount_cents);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER sync_expense_ledger_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_expense_ledger_entry();

-- 6. Attach Audit Log Triggers
-- ----------------------------------------------------------------------------

CREATE TRIGGER audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

CREATE TRIGGER audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

CREATE TRIGGER audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.ledger_lines
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();
