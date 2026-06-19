-- ============================================================================
-- MIGRATION: NexaCore CMMS Invoicing Webhook Trigger
-- Version:    20260619050000
-- Purpose:    Add nexacore_org_id mapping to clients and trigger a webhook post
--             when an invoice's status transitions to 'paid'.
-- ============================================================================

-- 1. Add nexacore_org_id column to clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS nexacore_org_id UUID;

-- 2. Create trigger function to post webhook on invoice payment
CREATE OR REPLACE FUNCTION public.notify_nexacore_invoice_paid()
RETURNS TRIGGER
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
  _nexacore_org_id UUID;
  _client_email TEXT;
  _webhook_secret TEXT := 'nc_whsec_f8a02c918bb109e4d567fe8902c3bb8a';
BEGIN
  -- Get the client's nexacore_org_id mapping (confined to your specific billing company/organization)
  SELECT nexacore_org_id, email INTO _nexacore_org_id, _client_email
  FROM public.clients
  WHERE id = NEW.client_id AND organization_id = NEW.organization_id;

  IF _nexacore_org_id IS NOT NULL AND NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    -- Asynchronously dispatch the notification payload to NexaCore CMMS Edge Function
    PERFORM net.http_post(
      url := 'https://ziobikgsrlyufceegzoo.supabase.co/functions/v1/invoicing-webhook',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _webhook_secret
      ),
      body := jsonb_build_object(
        'org_id', _nexacore_org_id,
        'client_email', _client_email,
        'invoice_id', NEW.id,
        'invoice_number', NEW.invoice_number,
        'paid_at', NOW()
      )::text
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Attach trigger to invoices table
DROP TRIGGER IF EXISTS trg_notify_nexacore_invoice_paid ON public.invoices;
CREATE TRIGGER trg_notify_nexacore_invoice_paid
  AFTER UPDATE OF status ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_nexacore_invoice_paid();
