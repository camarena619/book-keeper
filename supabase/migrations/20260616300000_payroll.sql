-- ============================================================================
-- PAYROLL (Phase 1: schema + chart-of-accounts)
-- ============================================================================
-- Lightweight in-app payroll. employees holds W-2 staff (SSN encrypted via
-- lib/crypto). payroll_runs + payroll_items hold each pay period's computed
-- gross->net figures (computation lives in server actions, Phase 2). New COA
-- accounts back the payroll journal entries.
-- ============================================================================

-- 1. Tables --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employees (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        UUID NOT NULL REFERENCES public.organizations ON DELETE CASCADE,
  name                   TEXT NOT NULL,
  email                  TEXT,
  address                TEXT,
  ssn_encrypted          TEXT,
  pay_type               TEXT NOT NULL CHECK (pay_type IN ('salary','hourly')),
  -- salary: annual amount in cents; hourly: per-hour rate in cents.
  pay_rate_cents         BIGINT NOT NULL DEFAULT 0 CHECK (pay_rate_cents >= 0),
  pay_frequency          TEXT NOT NULL CHECK (pay_frequency IN ('weekly','biweekly','semimonthly','monthly')),
  federal_withholding_bp INTEGER NOT NULL DEFAULT 0 CHECK (federal_withholding_bp BETWEEN 0 AND 10000),
  state_withholding_bp   INTEGER NOT NULL DEFAULT 0 CHECK (state_withholding_bp BETWEEN 0 AND 10000),
  filing_status          TEXT NOT NULL DEFAULT 'single' CHECK (filing_status IN ('single','married','head_of_household')),
  hire_date              DATE,
  status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations ON DELETE CASCADE,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  pay_date        DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payroll_items (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id         UUID NOT NULL REFERENCES public.payroll_runs ON DELETE CASCADE,
  employee_id            UUID NOT NULL REFERENCES public.employees ON DELETE RESTRICT,
  hours                  NUMERIC(8,2),
  gross_cents            BIGINT NOT NULL DEFAULT 0,
  federal_tax_cents      BIGINT NOT NULL DEFAULT 0,
  state_tax_cents        BIGINT NOT NULL DEFAULT 0,
  social_security_cents  BIGINT NOT NULL DEFAULT 0,
  medicare_cents         BIGINT NOT NULL DEFAULT 0,
  other_deductions_cents BIGINT NOT NULL DEFAULT 0,
  net_cents              BIGINT NOT NULL DEFAULT 0,
  employer_ss_cents      BIGINT NOT NULL DEFAULT 0,
  employer_medicare_cents BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS employees_org_idx ON public.employees (organization_id);
CREATE INDEX IF NOT EXISTS payroll_runs_org_idx ON public.payroll_runs (organization_id, pay_date);
CREATE INDEX IF NOT EXISTS payroll_items_run_idx ON public.payroll_items (payroll_run_id);
CREATE INDEX IF NOT EXISTS payroll_items_emp_idx ON public.payroll_items (employee_id);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_items ENABLE ROW LEVEL SECURITY;

-- 2. RLS (payroll is sensitive -> manage limited to owner/admin) ---------------
CREATE POLICY "employees_select" ON public.employees
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "employees_write" ON public.employees
  FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner','admin']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','admin']));

CREATE POLICY "payroll_runs_select" ON public.payroll_runs
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "payroll_runs_write" ON public.payroll_runs
  FOR ALL TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner','admin']))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','admin']));

CREATE POLICY "payroll_items_select" ON public.payroll_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.payroll_runs r
    WHERE r.id = payroll_run_id AND public.is_org_member(r.organization_id)));
CREATE POLICY "payroll_items_write" ON public.payroll_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.payroll_runs r
    WHERE r.id = payroll_run_id AND public.has_org_role(r.organization_id, ARRAY['owner','admin'])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.payroll_runs r
    WHERE r.id = payroll_run_id AND public.has_org_role(r.organization_id, ARRAY['owner','admin'])));

-- 3. Audit triggers ------------------------------------------------------------
DROP TRIGGER IF EXISTS tr_audit_employees ON public.employees;
CREATE TRIGGER tr_audit_employees AFTER INSERT OR UPDATE OR DELETE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();
DROP TRIGGER IF EXISTS tr_audit_payroll_runs ON public.payroll_runs;
CREATE TRIGGER tr_audit_payroll_runs AFTER INSERT OR UPDATE OR DELETE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- 4. Chart-of-accounts: add payroll accounts (seed for new orgs + backfill) ----
CREATE OR REPLACE FUNCTION public.seed_organization_accounts()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.accounts (organization_id, code, name, type, is_system) VALUES
    (NEW.id, '1010', 'SVB Operations Checking', 'asset', TRUE),
    (NEW.id, '1200', 'Accounts Receivable', 'asset', TRUE);
  INSERT INTO public.accounts (organization_id, code, name, type, is_system) VALUES
    (NEW.id, '2000', 'Accounts Payable', 'liability', TRUE),
    (NEW.id, '2100', 'Sales Tax Payable', 'liability', TRUE),
    (NEW.id, '2200', 'Payroll Liabilities', 'liability', TRUE);
  INSERT INTO public.accounts (organization_id, code, name, type, is_system) VALUES
    (NEW.id, '3000', 'Retained Earnings', 'equity', TRUE),
    (NEW.id, '3100', 'Owner''s Equity', 'equity', TRUE);
  INSERT INTO public.accounts (organization_id, code, name, type, is_system) VALUES
    (NEW.id, '4000', 'Operating Revenue (Invoices)', 'revenue', TRUE);
  INSERT INTO public.accounts (organization_id, code, name, type, is_system) VALUES
    (NEW.id, '5010', 'Rent Expense', 'expense', TRUE),
    (NEW.id, '5020', 'Software/SaaS Subscription Expense', 'expense', TRUE),
    (NEW.id, '5030', 'Materials & Supplies Expense', 'expense', TRUE),
    (NEW.id, '5090', 'Miscellaneous Expense', 'expense', TRUE),
    (NEW.id, '6000', 'Wages & Salaries Expense', 'expense', TRUE),
    (NEW.id, '6010', 'Payroll Tax Expense', 'expense', TRUE);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

INSERT INTO public.accounts (organization_id, code, name, type, is_system)
SELECT o.id, v.code, v.name, v.type, TRUE
FROM public.organizations o
CROSS JOIN (VALUES
  ('2200', 'Payroll Liabilities', 'liability'),
  ('6000', 'Wages & Salaries Expense', 'expense'),
  ('6010', 'Payroll Tax Expense', 'expense')
) AS v(code, name, type)
WHERE NOT EXISTS (
  SELECT 1 FROM public.accounts a WHERE a.organization_id = o.id AND a.code = v.code
);
