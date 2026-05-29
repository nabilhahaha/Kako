-- ============================================================================
-- 0030: Fix "Database error saving new user" on public self-registration
-- ----------------------------------------------------------------------------
-- The auth.users AFTER INSERT trigger erp_handle_new_user() (from 0006) inserts
-- into "erp_profiles" without a schema qualifier and without a fixed
-- search_path. During GoTrue's /signup the function runs with a search_path
-- that does not include public, so the unqualified name fails with
-- 42P01 "relation erp_profiles does not exist" → signup returns
-- "Database error saving new user". This never surfaced before because users
-- were previously created only via the service-role edge function; public
-- self-registration (0028) is the first real use of /signup.
--
-- Fix: schema-qualify the table and pin search_path. Idempotent.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.erp_handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  INSERT INTO public.erp_profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;
