-- ============================================================================
-- RECURRING INVOICES
-- ============================================================================
-- A recurring_invoices row is a template + schedule. A daily pg_cron job
-- (generate_due_recurring_invoices) materializes a real invoice + items each
-- time a schedule comes due, advancing next_run_date. Generated invoices flow
-- through the normal invoice ledger trigger.
-- ============================================================================

-- 1. Tables --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recurring_invoices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES public.organizations ON DELETE CASCADE,
  client_id             UUID NOT NULL REFERENCES public.clients ON DELETE CASCADE,
  frequency             TEXT NOT NULL CHECK (frequency IN ('weekly','biweekly','monthly','quarterly','yearly')),
  tax_rate_basis_points INTEGER NOT NULL DEFAULT 0 CHECK (tax_rate_basis_points BETWEEN 0 AND 10000),
  due_days              INTEGER NOT NULL DEFAULT 30 CHECK (due_days BETWEEN 0 AND 365),
  -- When true, generated invoices are created as 'sent' (and auto-post to the
  -- ledger). When false they land as 'draft' for manual review.
  auto_send             BOOLEAN NOT NULL DEFAULT FALSE,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  next_run_date         DATE NOT NULL,
  last_run_date         DATE,
  end_date              DATE,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.recurring_invoice_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_invoice_id  UUID NOT NULL REFERENCES public.recurring_invoices ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  description           TEXT,
  total_cents           INTEGER NOT NULL CHECK (total_cents >= 0),
  sort_order            INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS recurring_invoices_due_idx
  ON public.recurring_invoices (next_run_date) WHERE status = 'active';

ALTER TABLE public.recurring_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_invoice_items ENABLE ROW LEVEL SECURITY;

-- 2. RLS -----------------------------------------------------------------------
CREATE POLICY "recurring_select" ON public.recurring_invoices
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
CREATE POLICY "recurring_insert" ON public.recurring_invoices
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','admin','editor']));
CREATE POLICY "recurring_update" ON public.recurring_invoices
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner','admin','editor']));
CREATE POLICY "recurring_delete" ON public.recurring_invoices
  FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner','admin']));

CREATE POLICY "recurring_item_select" ON public.recurring_invoice_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.recurring_invoices r
    WHERE r.id = recurring_invoice_id AND public.is_org_member(r.organization_id)));
CREATE POLICY "recurring_item_write" ON public.recurring_invoice_items
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.recurring_invoices r
    WHERE r.id = recurring_invoice_id
      AND public.has_org_role(r.organization_id, ARRAY['owner','admin','editor'])))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.recurring_invoices r
    WHERE r.id = recurring_invoice_id
      AND public.has_org_role(r.organization_id, ARRAY['owner','admin','editor'])));

-- 3. Audit triggers ------------------------------------------------------------
DROP TRIGGER IF EXISTS tr_audit_recurring_invoices ON public.recurring_invoices;
CREATE TRIGGER tr_audit_recurring_invoices
  AFTER INSERT OR UPDATE OR DELETE ON public.recurring_invoices
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- 4. Generation function -------------------------------------------------------
-- _org_id NULL  -> process every org (used by the cron job).
-- _org_id set   -> process just that org (manual "Generate now"); caller must
--                  be a member. Returns the number of invoices created.
CREATE OR REPLACE FUNCTION public.generate_due_recurring_invoices(_org_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _rec            RECORD;
  _invoice_id     UUID;
  _invoice_number TEXT;
  _next           DATE;
  _due            TIMESTAMPTZ;
  _created        INTEGER := 0;
  _guard          INTEGER;
BEGIN
  IF _org_id IS NOT NULL AND NOT public.is_org_member(_org_id) THEN
    RAISE EXCEPTION 'Not a member of organization %', _org_id;
  END IF;

  FOR _rec IN
    SELECT * FROM public.recurring_invoices
    WHERE status = 'active'
      AND next_run_date <= CURRENT_DATE
      AND (_org_id IS NULL OR organization_id = _org_id)
  LOOP
    _next  := _rec.next_run_date;
    _guard := 0;

    -- One invoice per due period; catches up if the job lapsed (capped).
    WHILE _next <= CURRENT_DATE
      AND (_rec.end_date IS NULL OR _next <= _rec.end_date)
      AND _guard < 60
    LOOP
      _guard := _guard + 1;

      SELECT 'INV-' || EXTRACT(YEAR FROM CURRENT_DATE)::INT || '-' || (1000 + COUNT(*))::INT
        INTO _invoice_number
      FROM public.invoices WHERE organization_id = _rec.organization_id;

      _due := (_next + (_rec.due_days || ' days')::INTERVAL)::TIMESTAMPTZ;

      -- Insert as draft first so the ledger trigger sees the line items when we
      -- (optionally) move it to 'sent' below.
      INSERT INTO public.invoices
        (organization_id, client_id, invoice_number, status, tax_rate_basis_points, due_date)
      VALUES
        (_rec.organization_id, _rec.client_id, _invoice_number, 'draft',
         _rec.tax_rate_basis_points, _due)
      RETURNING id INTO _invoice_id;

      INSERT INTO public.invoice_items (invoice_id, item_type, title, description, total_cents, sort_order)
      SELECT _invoice_id, 'flat_rate', title, description, total_cents, sort_order
      FROM public.recurring_invoice_items
      WHERE recurring_invoice_id = _rec.id;

      IF _rec.auto_send THEN
        UPDATE public.invoices SET status = 'sent' WHERE id = _invoice_id;
      END IF;

      _created := _created + 1;

      _next := (CASE _rec.frequency
        WHEN 'weekly'    THEN _next + INTERVAL '7 days'
        WHEN 'biweekly'  THEN _next + INTERVAL '14 days'
        WHEN 'monthly'   THEN _next + INTERVAL '1 month'
        WHEN 'quarterly' THEN _next + INTERVAL '3 months'
        WHEN 'yearly'    THEN _next + INTERVAL '1 year'
      END)::DATE;
    END LOOP;

    UPDATE public.recurring_invoices
    SET next_run_date = _next,
        last_run_date = CURRENT_DATE,
        status = CASE WHEN end_date IS NOT NULL AND _next > end_date THEN 'paused' ELSE status END
    WHERE id = _rec.id;
  END LOOP;

  RETURN _created;
END;
$$;

-- 5. Daily schedule via pg_cron ------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('generate-recurring-invoices');
EXCEPTION WHEN OTHERS THEN
  NULL; -- not scheduled yet
END $$;

SELECT cron.schedule(
  'generate-recurring-invoices',
  '0 8 * * *',
  $$ SELECT public.generate_due_recurring_invoices(); $$
);
