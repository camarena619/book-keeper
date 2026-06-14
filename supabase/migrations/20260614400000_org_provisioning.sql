-- ============================================================================
-- MIGRATION: Organization provisioning RPC
-- Version:    20260614400000
-- Purpose:    Allow an authenticated user to create a new organization AND
--             enroll themselves as its owner in one atomic, RLS-safe call.
--             A plain client INSERT can't do this: org_insert is permitted, but
--             orgmember_insert requires the caller to already hold owner/admin
--             in that org — which they don't for a brand-new org. This
--             SECURITY DEFINER function bridges that gap safely by pinning the
--             membership to the calling user (auth.uid()).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_organization(
  org_name TEXT,
  org_email TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_org_id UUID;
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF org_name IS NULL OR length(trim(org_name)) = 0 THEN
    RAISE EXCEPTION 'Organization name is required';
  END IF;

  INSERT INTO public.organizations (name, billing_email)
  VALUES (trim(org_name), org_email)
  RETURNING id INTO new_org_id;
  -- (seed_organization_accounts trigger seeds the default chart of accounts)

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (new_org_id, uid, 'owner');

  RETURN new_org_id;
END;
$$;

-- Allow authenticated users to call it.
GRANT EXECUTE ON FUNCTION public.create_organization(TEXT, TEXT) TO authenticated;
