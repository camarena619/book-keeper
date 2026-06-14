-- ==========================================
-- 1. BASE DATABASE TABLES
-- ==========================================

-- Organizations (Businesses)
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  routing_number TEXT,
  account_number TEXT,
  billing_email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Organization Members (Link table mapping Users to Businesses)
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL, -- references auth.users
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

-- Profiles (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Clients
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Quotes
CREATE TABLE IF NOT EXISTS public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES public.clients ON DELETE CASCADE NOT NULL,
  quote_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'converted')),
  tax_rate_basis_points INTEGER NOT NULL DEFAULT 0,
  valid_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Quote Items
CREATE TABLE IF NOT EXISTS public.quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID REFERENCES public.quotes ON DELETE CASCADE NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('labor', 'materials', 'flat_rate')),
  title TEXT NOT NULL,
  description TEXT,
  total_cents INTEGER NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER DEFAULT 0
);

-- Invoices
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES public.clients ON DELETE CASCADE NOT NULL,
  quote_id UUID REFERENCES public.quotes,
  invoice_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  tax_rate_basis_points INTEGER NOT NULL DEFAULT 0,
  due_date TIMESTAMP WITH TIME ZONE NOT NULL,
  pdf_storage_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Invoice Items
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES public.invoices ON DELETE CASCADE NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('labor', 'materials', 'flat_rate')),
  title TEXT NOT NULL,
  description TEXT,
  total_cents INTEGER NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER DEFAULT 0
);

-- Linked Bank Accounts (Plaid items)
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations ON DELETE CASCADE NOT NULL,
  plaid_item_id TEXT NOT NULL,
  plaid_account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mask TEXT,
  official_name TEXT,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  account_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Linked Bank Transactions (Raw bank feed)
CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id UUID REFERENCES public.bank_accounts ON DELETE CASCADE NOT NULL,
  plaid_transaction_id TEXT UNIQUE NOT NULL,
  amount_cents INTEGER NOT NULL, -- Positive for expenses, negative for deposits
  transaction_date DATE NOT NULL,
  merchant_name TEXT NOT NULL,
  pending BOOLEAN DEFAULT FALSE,
  plaid_category TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Rule Engine for Expense Mapping
CREATE TABLE IF NOT EXISTS public.expense_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations ON DELETE CASCADE NOT NULL,
  match_pattern TEXT NOT NULL,
  target_category TEXT NOT NULL CHECK (target_category IN ('materials', 'rent', 'utilities', 'software', 'tax', 'travel', 'other')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Verified Suppliers
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  contact_email TEXT,
  phone TEXT,
  contract_terms TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Categorized Expenses (Reconciliation target)
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations ON DELETE CASCADE NOT NULL,
  bank_transaction_id UUID REFERENCES public.bank_transactions,
  supplier_id UUID REFERENCES public.suppliers,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('materials', 'rent', 'utilities', 'software', 'tax', 'travel', 'other')),
  amount_cents INTEGER NOT NULL,
  expense_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  receipt_storage_path TEXT,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending_review', 'approved')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 2. CALCULATED LEDGER VIEWS (SINGLE SOURCE OF TRUTH)
-- ==========================================

-- Quote Ledger View
CREATE OR REPLACE VIEW public.quote_ledger AS
SELECT 
  q.id AS quote_id,
  q.organization_id,
  q.client_id,
  c.name AS client_name,
  q.quote_number,
  q.status,
  q.tax_rate_basis_points,
  q.created_at,
  q.valid_until,
  COALESCE(SUM(qi.total_cents), 0)::integer AS subtotal_cents,
  ROUND(
    (COALESCE(SUM(qi.total_cents), 0)::numeric * q.tax_rate_basis_points::numeric) / 10000.0
  )::integer AS tax_cents,
  (
    COALESCE(SUM(qi.total_cents), 0) + 
    ROUND((COALESCE(SUM(qi.total_cents), 0)::numeric * q.tax_rate_basis_points::numeric) / 10000.0)
  )::integer AS grand_total_cents
FROM public.quotes q
LEFT JOIN public.clients c ON q.client_id = c.id
LEFT JOIN public.quote_items qi ON q.id = qi.quote_id
GROUP BY q.id, c.name;

-- Invoice Ledger View
CREATE OR REPLACE VIEW public.invoice_ledger AS
SELECT 
  i.id AS invoice_id,
  i.organization_id,
  i.client_id,
  c.name AS client_name,
  c.email AS client_email,
  c.address AS client_address,
  i.invoice_number,
  i.status,
  i.tax_rate_basis_points,
  i.created_at,
  i.due_date,
  i.pdf_storage_path,
  COALESCE(SUM(ii.total_cents), 0)::integer AS subtotal_cents,
  ROUND(
    (COALESCE(SUM(ii.total_cents), 0)::numeric * i.tax_rate_basis_points::numeric) / 10000.0
  )::integer AS tax_cents,
  (
    COALESCE(SUM(ii.total_cents), 0) + 
    ROUND((COALESCE(SUM(ii.total_cents), 0)::numeric * i.tax_rate_basis_points::numeric) / 10000.0)
  )::integer AS grand_total_cents
FROM public.invoices i
LEFT JOIN public.clients c ON i.client_id = c.id
LEFT JOIN public.invoice_items ii ON i.id = ii.invoice_id
GROUP BY i.id, c.name, c.email, c.address;

-- Operational Command Center Metrics View
CREATE OR REPLACE VIEW public.operational_ledger AS
SELECT
  organization_id AS user_id, -- Maps logically to dashboard owner query
  COALESCE(SUM(CASE WHEN status = 'paid' THEN grand_total_cents ELSE 0 END), 0)::integer AS total_sales_cents,
  COALESCE(SUM(CASE WHEN status IN ('sent', 'overdue') THEN grand_total_cents ELSE 0 END), 0)::integer AS outstanding_receivables_cents,
  (SELECT COALESCE(SUM(amount_cents), 0)::integer FROM public.expenses WHERE expenses.organization_id = il.organization_id) AS total_expenses_cents,
  (
    COALESCE(SUM(CASE WHEN status = 'paid' THEN grand_total_cents ELSE 0 END), 0) - 
    (SELECT COALESCE(SUM(amount_cents), 0)::integer FROM public.expenses WHERE expenses.organization_id = il.organization_id)
  )::integer AS net_profit_cents
FROM public.invoice_ledger il
GROUP BY organization_id;

-- ==========================================
-- 3. HELPER FUNCTIONS & DB TRIGGERS
-- ==========================================

-- Helper organization check
CREATE OR REPLACE FUNCTION public.is_org_member(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = org_id AND om.user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Quote to Invoice transactional conversion
CREATE OR REPLACE FUNCTION public.convert_quote_to_invoice(
  target_quote_id UUID,
  net_days INTEGER DEFAULT 30
)
RETURNS UUID AS $$
DECLARE
  new_invoice_id UUID;
  quote_rec RECORD;
  quote_item_rec RECORD;
BEGIN
  SELECT * INTO quote_rec 
  FROM public.quotes 
  WHERE id = target_quote_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  IF NOT public.is_org_member(quote_rec.organization_id) THEN
    RAISE EXCEPTION 'Access denied: not a member of organization';
  END IF;

  IF quote_rec.status = 'converted' THEN
    RAISE EXCEPTION 'Quote has already been converted to an invoice';
  END IF;

  -- Insert new invoice record
  INSERT INTO public.invoices (
    organization_id,
    client_id,
    quote_id,
    invoice_number,
    status,
    tax_rate_basis_points,
    due_date
  ) VALUES (
    quote_rec.organization_id,
    quote_rec.client_id,
    quote_rec.id,
    'INV-' || quote_rec.quote_number,
    'sent',
    quote_rec.tax_rate_basis_points,
    NOW() + (net_days || ' days')::interval
  ) RETURNING id INTO new_invoice_id;

  -- Copy items
  FOR quote_item_rec IN 
    SELECT * FROM public.quote_items WHERE quote_id = target_quote_id
  LOOP
    INSERT INTO public.invoice_items (
      invoice_id,
      item_type,
      title,
      description,
      total_cents,
      details,
      sort_order
    ) VALUES (
      new_invoice_id,
      quote_item_rec.item_type,
      quote_item_rec.title,
      quote_item_rec.description,
      quote_item_rec.total_cents,
      quote_item_rec.details,
      quote_item_rec.sort_order
    );
  END LOOP;

  -- Update parent status
  UPDATE public.quotes 
  SET status = 'converted' 
  WHERE id = target_quote_id;

  RETURN new_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- AI auto-categorization bank transactions trigger
CREATE OR REPLACE FUNCTION public.auto_categorize_bank_transaction()
RETURNS TRIGGER AS $$
DECLARE
  matched_category TEXT;
  org_id UUID;
BEGIN
  SELECT organization_id INTO org_id 
  FROM public.bank_accounts 
  WHERE id = NEW.bank_account_id;

  -- Match pattern
  SELECT target_category INTO matched_category
  FROM public.expense_rules
  WHERE organization_id = org_id
    AND NEW.merchant_name ILIKE match_pattern
  LIMIT 1;

  -- Fallbacks
  IF matched_category IS NULL THEN
    CASE 
      WHEN NEW.plaid_category ILIKE '%travel%' OR NEW.plaid_category ILIKE '%taxi%' THEN
        matched_category := 'travel';
      WHEN NEW.plaid_category ILIKE '%software%' OR NEW.plaid_category ILIKE '%computer%' THEN
        matched_category := 'software';
      WHEN NEW.plaid_category ILIKE '%rent%' OR NEW.plaid_category ILIKE '%utilities%' THEN
        matched_category := 'rent';
      ELSE
        matched_category := 'other';
    END CASE;
  END IF;

  -- Log pending expense for verification
  INSERT INTO public.expenses (
    organization_id,
    bank_transaction_id,
    title,
    category,
    amount_cents,
    expense_date,
    status
  ) VALUES (
    org_id,
    NEW.id,
    NEW.merchant_name,
    matched_category,
    NEW.amount_cents,
    NEW.transaction_date::timestamp with time zone,
    'pending_review'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER tr_auto_categorize_bank_transaction
  AFTER INSERT ON public.bank_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_categorize_bank_transaction();

-- ==========================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Enable RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Members can select their organization" ON public.organizations FOR SELECT USING (public.is_org_member(id));
CREATE POLICY "Owners can update their organization" ON public.organizations FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.organization_members om WHERE om.organization_id = id AND om.user_id = auth.uid() AND om.role = 'owner')
);

CREATE POLICY "Members can view membership lists" ON public.organization_members FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY "Users can manage their profiles" ON public.profiles FOR ALL USING (auth.uid() = id);

CREATE POLICY "Manage clients" ON public.clients FOR ALL USING (public.is_org_member(organization_id));
CREATE POLICY "Manage quotes" ON public.quotes FOR ALL USING (public.is_org_member(organization_id));
CREATE POLICY "Manage quote_items" ON public.quote_items FOR ALL USING (
  EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id AND public.is_org_member(q.organization_id))
);
CREATE POLICY "Manage invoices" ON public.invoices FOR ALL USING (public.is_org_member(organization_id));
CREATE POLICY "Manage invoice_items" ON public.invoice_items FOR ALL USING (
  EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_items.invoice_id AND public.is_org_member(i.organization_id))
);
CREATE POLICY "Manage bank accounts" ON public.bank_accounts FOR ALL USING (public.is_org_member(organization_id));
CREATE POLICY "Manage bank transactions" ON public.bank_transactions FOR ALL USING (
  EXISTS (SELECT 1 FROM public.bank_accounts ba WHERE ba.id = bank_transactions.bank_account_id AND public.is_org_member(ba.organization_id))
);
CREATE POLICY "Manage expense rules" ON public.expense_rules FOR ALL USING (public.is_org_member(organization_id));
CREATE POLICY "Manage suppliers" ON public.suppliers FOR ALL USING (public.is_org_member(organization_id));
CREATE POLICY "Manage expenses" ON public.expenses FOR ALL USING (public.is_org_member(organization_id));
