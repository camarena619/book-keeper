-- ============================================================================
-- MIGRATION: Fix profiles schema + signup trigger
-- Version:    20260614300000
-- Purpose:    The init migration's handle_new_user_signup() inserts into
--             profiles(id, email, updated_at) but profiles had no `email`
--             column, so the trigger raised and every auth.users INSERT rolled
--             back — i.e. signup was impossible against the real database.
--             This migration adds the missing column and makes the trigger
--             resilient so a profile/org provisioning hiccup never blocks auth.
-- ============================================================================

-- 1. Add the column the signup trigger expects (idempotent).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Recreate the signup handler defensively.
--    - email column now exists
--    - guards against duplicate provisioning on re-fire
--    - never lets a provisioning error roll back the auth.users insert
CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
BEGIN
  -- 1. Create / upsert the public profile
  INSERT INTO public.profiles (id, email, updated_at)
  VALUES (NEW.id, NEW.email, NOW())
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = NOW();

  -- 2. Only provision a default org the first time this user signs up
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members WHERE user_id = NEW.id
  ) THEN
    INSERT INTO public.organizations (name, billing_email)
    VALUES ('My Business LLC', NEW.email)
    RETURNING id INTO new_org_id;

    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (new_org_id, NEW.id, 'owner');
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Auth must succeed even if profile/org provisioning fails; the app can
    -- backfill a missing org via the onboarding flow. Log and continue.
    RAISE WARNING 'handle_new_user_signup failed for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger already exists from the init migration (tr_handle_new_user_signup);
-- CREATE OR REPLACE FUNCTION above updates the body in place.
