-- ============================================================================
-- MIGRATION: Security Hardening for Book Keeper
-- Version:    20260614100000
-- Purpose:    Replace coarse-grained "FOR ALL" RLS policies with granular
--             per-operation RBAC policies, add audit logging, session tracking,
--             and MFA enforcement on sensitive financial tables.
-- ============================================================================

-- ============================================================================
-- SECTION 1: PERFORMANCE INDEXES
-- Composite indexes on organization_members to accelerate every RLS policy
-- check. Without these, every row-level query scans the membership table.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_org_members_user_id
  ON public.organization_members(user_id);

CREATE INDEX IF NOT EXISTS idx_org_members_org_id
  ON public.organization_members(organization_id);

-- Composite covering index – satisfies the most common RLS predicate pattern:
-- WHERE user_id = auth.uid() AND organization_id = $1
CREATE INDEX IF NOT EXISTS idx_org_members_user_org
  ON public.organization_members(user_id, organization_id);


-- ============================================================================
-- SECTION 2: RBAC HELPER FUNCTIONS
-- Thin wrappers over organization_members that keep policy definitions concise
-- and push privilege logic into reusable, testable functions.
-- Both are SECURITY DEFINER so they can read organization_members regardless
-- of the caller's RLS context, and STABLE because they return the same result
-- within a single statement for the same inputs.
-- ============================================================================

-- Returns the role text ('owner', 'admin', 'editor', 'viewer') for the
-- currently authenticated user within the specified organization, or NULL
-- if the user is not a member.
CREATE OR REPLACE FUNCTION public.get_user_org_role(org_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role
  FROM public.organization_members
  WHERE organization_id = org_id
    AND user_id = auth.uid()
  LIMIT 1;
$$;

-- Returns TRUE if the currently authenticated user holds any of the roles
-- listed in allowed_roles for the specified organization.
CREATE OR REPLACE FUNCTION public.has_org_role(org_id UUID, allowed_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND role = ANY(allowed_roles)
  );
$$;


-- ============================================================================
-- SECTION 3: AUDIT LOG TABLE
-- Immutable, append-only ledger that records every data mutation across the
-- financial tables. Uses JSONB for old/new snapshots so schema changes don't
-- break historical records.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name      TEXT        NOT NULL,
  record_id       TEXT        NOT NULL,  -- TEXT handles non-UUID PKs gracefully
  action          TEXT        NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  actor_id        UUID,                  -- auth.uid() captured at trigger time
  actor_role      TEXT,                  -- cached role at time of action
  old_data        JSONB,                 -- NULL on INSERT
  new_data        JSONB,                 -- NULL on DELETE
  changed_fields  TEXT[],                -- populated only on UPDATE
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Lookup indexes for common audit queries
CREATE INDEX IF NOT EXISTS idx_audit_log_table
  ON public.audit_log(table_name);

CREATE INDEX IF NOT EXISTS idx_audit_log_record
  ON public.audit_log(record_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor
  ON public.audit_log(actor_id);

-- BRIN is ideal here: created_at is naturally correlated with physical row
-- order (append-only table), so BRIN provides excellent compression and
-- fast range scans for time-based audit queries.
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
  ON public.audit_log USING brin(created_at);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- SECTION 4: AUDIT TRIGGER FUNCTION
-- Generic trigger function attached to every financial table. It captures
-- the full before/after state plus a diff of changed columns on UPDATE.
-- Runs as SECURITY DEFINER to guarantee write access to audit_log regardless
-- of the invoking user's privileges.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS TRIGGER AS $$
DECLARE
  _actor_id     UUID;
  _role         TEXT;
  _old_jsonb    JSONB;
  _new_jsonb    JSONB;
  _changed      TEXT[];
  _key          TEXT;
BEGIN
  -- Capture the authenticated user (may be NULL for system-level triggers)
  _actor_id := auth.uid();

  -- Best-effort role lookup – picks the first membership row for the actor.
  -- This is intentionally non-org-specific because the trigger doesn't know
  -- which org column to look at (varies by table).
  SELECT role INTO _role
  FROM public.organization_members
  WHERE user_id = _actor_id
  LIMIT 1;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (table_name, record_id, action, actor_id, actor_role, old_data, new_data)
    VALUES (TG_TABLE_NAME, NEW.id::TEXT, 'INSERT', _actor_id, _role, NULL, to_jsonb(NEW));
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    _old_jsonb := to_jsonb(OLD);
    _new_jsonb := to_jsonb(NEW);

    -- Build the list of columns whose values actually changed
    _changed := ARRAY(
      SELECT key
      FROM jsonb_each(_new_jsonb) AS n(key, value)
      WHERE _old_jsonb -> n.key IS DISTINCT FROM n.value
    );

    -- Skip logging if nothing actually changed (e.g. UPDATE SET col = col)
    IF array_length(_changed, 1) IS NULL THEN
      RETURN NULL;
    END IF;

    INSERT INTO public.audit_log (table_name, record_id, action, actor_id, actor_role, old_data, new_data, changed_fields)
    VALUES (TG_TABLE_NAME, NEW.id::TEXT, 'UPDATE', _actor_id, _role, _old_jsonb, _new_jsonb, _changed);
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (table_name, record_id, action, actor_id, actor_role, old_data, new_data)
    VALUES (TG_TABLE_NAME, OLD.id::TEXT, 'DELETE', _actor_id, _role, to_jsonb(OLD), NULL);
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- SECTION 5: ATTACH AUDIT TRIGGERS
-- Wire audit_trigger_fn to every financial table. Triggers fire AFTER the
-- operation so the row is already committed and we capture the final state.
-- DROP IF EXISTS ensures idempotent re-runs.
-- ============================================================================

-- organizations
DROP TRIGGER IF EXISTS tr_audit_organizations ON public.organizations;
CREATE TRIGGER tr_audit_organizations
  AFTER INSERT OR UPDATE OR DELETE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- organization_members
DROP TRIGGER IF EXISTS tr_audit_organization_members ON public.organization_members;
CREATE TRIGGER tr_audit_organization_members
  AFTER INSERT OR UPDATE OR DELETE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- clients
DROP TRIGGER IF EXISTS tr_audit_clients ON public.clients;
CREATE TRIGGER tr_audit_clients
  AFTER INSERT OR UPDATE OR DELETE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- quotes
DROP TRIGGER IF EXISTS tr_audit_quotes ON public.quotes;
CREATE TRIGGER tr_audit_quotes
  AFTER INSERT OR UPDATE OR DELETE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- quote_items
DROP TRIGGER IF EXISTS tr_audit_quote_items ON public.quote_items;
CREATE TRIGGER tr_audit_quote_items
  AFTER INSERT OR UPDATE OR DELETE ON public.quote_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- invoices
DROP TRIGGER IF EXISTS tr_audit_invoices ON public.invoices;
CREATE TRIGGER tr_audit_invoices
  AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- invoice_items
DROP TRIGGER IF EXISTS tr_audit_invoice_items ON public.invoice_items;
CREATE TRIGGER tr_audit_invoice_items
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- bank_accounts
DROP TRIGGER IF EXISTS tr_audit_bank_accounts ON public.bank_accounts;
CREATE TRIGGER tr_audit_bank_accounts
  AFTER INSERT OR UPDATE OR DELETE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- bank_transactions
DROP TRIGGER IF EXISTS tr_audit_bank_transactions ON public.bank_transactions;
CREATE TRIGGER tr_audit_bank_transactions
  AFTER INSERT OR UPDATE OR DELETE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- expense_rules
DROP TRIGGER IF EXISTS tr_audit_expense_rules ON public.expense_rules;
CREATE TRIGGER tr_audit_expense_rules
  AFTER INSERT OR UPDATE OR DELETE ON public.expense_rules
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- suppliers
DROP TRIGGER IF EXISTS tr_audit_suppliers ON public.suppliers;
CREATE TRIGGER tr_audit_suppliers
  AFTER INSERT OR UPDATE OR DELETE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- expenses
DROP TRIGGER IF EXISTS tr_audit_expenses ON public.expenses;
CREATE TRIGGER tr_audit_expenses
  AFTER INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();


-- ============================================================================
-- SECTION 6: SESSION TRACKING TABLE
-- Records active browser/device sessions for each user. Enables "active
-- sessions" UI, anomalous-login detection, and remote session revocation.
-- No FK to auth.users to avoid cross-schema dependency issues in Supabase.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL,  -- conceptual FK to auth.users
  ip_address        INET,
  user_agent        TEXT,
  device_fingerprint TEXT,
  city              TEXT,
  country           TEXT,
  is_current        BOOLEAN     DEFAULT FALSE,
  last_active_at    TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  revoked_at        TIMESTAMPTZ            -- NULL = active session; set = revoked
);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Users may only interact with their own sessions
CREATE POLICY "Users manage own sessions"
  ON public.user_sessions
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ============================================================================
-- SECTION 7: DROP OLD RLS POLICIES
-- Remove the coarse-grained "FOR ALL" policies from the init migration.
-- These are replaced by granular per-operation policies in Section 8.
-- Using IF EXISTS for idempotent re-runs.
-- ============================================================================

DROP POLICY IF EXISTS "Members can select their organization" ON public.organizations;
DROP POLICY IF EXISTS "Owners can update their organization" ON public.organizations;
DROP POLICY IF EXISTS "Members can view membership lists" ON public.organization_members;
DROP POLICY IF EXISTS "Users can manage their profiles" ON public.profiles;
DROP POLICY IF EXISTS "Manage clients" ON public.clients;
DROP POLICY IF EXISTS "Manage quotes" ON public.quotes;
DROP POLICY IF EXISTS "Manage quote_items" ON public.quote_items;
DROP POLICY IF EXISTS "Manage invoices" ON public.invoices;
DROP POLICY IF EXISTS "Manage invoice_items" ON public.invoice_items;
DROP POLICY IF EXISTS "Manage bank accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Manage bank transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Manage expense rules" ON public.expense_rules;
DROP POLICY IF EXISTS "Manage suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Manage expenses" ON public.expenses;


-- ============================================================================
-- SECTION 8: GRANULAR RBAC RLS POLICIES
-- Principle of least privilege: each table gets separate SELECT / INSERT /
-- UPDATE / DELETE policies. Operations without a policy are implicitly denied.
-- Role hierarchy: owner > admin > editor > viewer (read-only).
-- ============================================================================

-- --------------------------------------------------------------------------
-- organizations
-- --------------------------------------------------------------------------
-- SELECT: any member of the org can view it
CREATE POLICY "org_select" ON public.organizations
  FOR SELECT TO authenticated
  USING (public.is_org_member(id));

-- INSERT: any authenticated user may create a new organization
CREATE POLICY "org_insert" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- UPDATE: owner only
CREATE POLICY "org_update" ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.has_org_role(id, ARRAY['owner']));

-- DELETE: no policy → always blocked

-- --------------------------------------------------------------------------
-- organization_members
-- --------------------------------------------------------------------------
-- SELECT: any member can see the roster
CREATE POLICY "orgmember_select" ON public.organization_members
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

-- INSERT: owner + admin can invite members
CREATE POLICY "orgmember_insert" ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','admin']));

-- UPDATE: owner + admin can change roles
CREATE POLICY "orgmember_update" ON public.organization_members
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner','admin']));

-- DELETE: owner only can remove members
CREATE POLICY "orgmember_delete" ON public.organization_members
  FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner']));

-- --------------------------------------------------------------------------
-- profiles
-- --------------------------------------------------------------------------
-- ALL: users can only manage their own profile
CREATE POLICY "profile_all" ON public.profiles
  FOR ALL TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- --------------------------------------------------------------------------
-- clients
-- --------------------------------------------------------------------------
CREATE POLICY "client_select" ON public.clients
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "client_insert" ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','admin','editor']));

CREATE POLICY "client_update" ON public.clients
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner','admin','editor']));

CREATE POLICY "client_delete" ON public.clients
  FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner','admin']));

-- --------------------------------------------------------------------------
-- quotes
-- --------------------------------------------------------------------------
CREATE POLICY "quote_select" ON public.quotes
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "quote_insert" ON public.quotes
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','admin','editor']));

CREATE POLICY "quote_update" ON public.quotes
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner','admin','editor']));

CREATE POLICY "quote_delete" ON public.quotes
  FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner','admin']));

-- --------------------------------------------------------------------------
-- quote_items (resolves org_id via parent quotes table)
-- --------------------------------------------------------------------------
CREATE POLICY "quoteitem_select" ON public.quote_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_items.quote_id
        AND public.is_org_member(q.organization_id)
    )
  );

CREATE POLICY "quoteitem_insert" ON public.quote_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_items.quote_id
        AND public.has_org_role(q.organization_id, ARRAY['owner','admin','editor'])
    )
  );

CREATE POLICY "quoteitem_update" ON public.quote_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_items.quote_id
        AND public.has_org_role(q.organization_id, ARRAY['owner','admin','editor'])
    )
  );

CREATE POLICY "quoteitem_delete" ON public.quote_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE q.id = quote_items.quote_id
        AND public.has_org_role(q.organization_id, ARRAY['owner','admin'])
    )
  );

-- --------------------------------------------------------------------------
-- invoices
-- --------------------------------------------------------------------------
CREATE POLICY "invoice_select" ON public.invoices
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "invoice_insert" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','admin','editor']));

CREATE POLICY "invoice_update" ON public.invoices
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner','admin','editor']));

-- DELETE: owner only – invoices are legal documents
CREATE POLICY "invoice_delete" ON public.invoices
  FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner']));

-- --------------------------------------------------------------------------
-- invoice_items (resolves org_id via parent invoices table)
-- --------------------------------------------------------------------------
CREATE POLICY "invoiceitem_select" ON public.invoice_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_items.invoice_id
        AND public.is_org_member(i.organization_id)
    )
  );

CREATE POLICY "invoiceitem_insert" ON public.invoice_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_items.invoice_id
        AND public.has_org_role(i.organization_id, ARRAY['owner','admin','editor'])
    )
  );

CREATE POLICY "invoiceitem_update" ON public.invoice_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_items.invoice_id
        AND public.has_org_role(i.organization_id, ARRAY['owner','admin','editor'])
    )
  );

-- DELETE: owner only for invoice line items
CREATE POLICY "invoiceitem_delete" ON public.invoice_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_items.invoice_id
        AND public.has_org_role(i.organization_id, ARRAY['owner'])
    )
  );

-- --------------------------------------------------------------------------
-- bank_accounts
-- --------------------------------------------------------------------------
CREATE POLICY "bankaccount_select" ON public.bank_accounts
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

-- INSERT/UPDATE/DELETE: owner only – linking bank accounts is high-risk
CREATE POLICY "bankaccount_insert" ON public.bank_accounts
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner']));

CREATE POLICY "bankaccount_update" ON public.bank_accounts
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner']));

CREATE POLICY "bankaccount_delete" ON public.bank_accounts
  FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner']));

-- --------------------------------------------------------------------------
-- bank_transactions (resolves org_id via parent bank_accounts table)
-- --------------------------------------------------------------------------
CREATE POLICY "banktx_select" ON public.bank_transactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bank_accounts ba
      WHERE ba.id = bank_transactions.bank_account_id
        AND public.is_org_member(ba.organization_id)
    )
  );

-- INSERT: no permissive policy for regular users.
-- Bank transactions are inserted by the system via SECURITY DEFINER triggers
-- (auto_categorize_bank_transaction). No user-facing INSERT policy needed.

-- UPDATE: no policy → always blocked (bank feed is immutable)

-- DELETE: owner only
CREATE POLICY "banktx_delete" ON public.bank_transactions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bank_accounts ba
      WHERE ba.id = bank_transactions.bank_account_id
        AND public.has_org_role(ba.organization_id, ARRAY['owner'])
    )
  );

-- --------------------------------------------------------------------------
-- expense_rules
-- --------------------------------------------------------------------------
CREATE POLICY "expenserule_select" ON public.expense_rules
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "expenserule_insert" ON public.expense_rules
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','admin']));

CREATE POLICY "expenserule_update" ON public.expense_rules
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner','admin']));

CREATE POLICY "expenserule_delete" ON public.expense_rules
  FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner','admin']));

-- --------------------------------------------------------------------------
-- suppliers
-- --------------------------------------------------------------------------
CREATE POLICY "supplier_select" ON public.suppliers
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY "supplier_insert" ON public.suppliers
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','admin','editor']));

CREATE POLICY "supplier_update" ON public.suppliers
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner','admin','editor']));

CREATE POLICY "supplier_delete" ON public.suppliers
  FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner','admin']));

-- --------------------------------------------------------------------------
-- expenses
-- --------------------------------------------------------------------------
CREATE POLICY "expense_select" ON public.expenses
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

-- INSERT: owner + admin + editor, plus system triggers (SECURITY DEFINER)
CREATE POLICY "expense_insert" ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','admin','editor']));

CREATE POLICY "expense_update" ON public.expenses
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner','admin','editor']));

CREATE POLICY "expense_delete" ON public.expenses
  FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner','admin']));

-- --------------------------------------------------------------------------
-- audit_log
-- --------------------------------------------------------------------------
-- SELECT: only owner + admin can review audit trails.
-- Org resolution: audit rows store organization_id in their JSONB payload,
-- so we COALESCE across new_data and old_data (DELETE has no new_data).
CREATE POLICY "auditlog_select" ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    public.has_org_role(
      COALESCE(
        (new_data->>'organization_id')::UUID,
        (old_data->>'organization_id')::UUID
      ),
      ARRAY['owner','admin']
    )
  );

-- INSERT: unrestricted WITH CHECK – audit rows are written by SECURITY
-- DEFINER triggers, not by end users directly.
CREATE POLICY "auditlog_insert" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- UPDATE: no policy → always blocked (audit trail is immutable)
-- DELETE: no policy → always blocked (audit trail is immutable)


-- ============================================================================
-- SECTION 9: MFA RESTRICTIVE POLICY
-- RESTRICTIVE policies combine with AND logic against permissive policies.
-- This ensures that even if a permissive policy grants access, the user must
-- have completed Step-Up Authentication (AAL2 / MFA) to touch bank accounts.
-- Without MFA, all bank_account operations are blocked – including SELECT.
-- ============================================================================

CREATE POLICY "Require MFA for bank accounts"
  ON public.bank_accounts
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING ((SELECT auth.jwt()->>'aal') = 'aal2');
