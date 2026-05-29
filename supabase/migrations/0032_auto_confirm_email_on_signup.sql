-- ============================================================================
-- 0032: Auto-confirm email on signup (B2B self-service, no email verification)
-- ----------------------------------------------------------------------------
-- This is a B2B app where a company signs up and must start working
-- immediately; waiting on an email confirmation link breaks the free-trial
-- onboarding flow and the app's signup code expects a session right away
-- (if (data.session) { provision company }). Rather than depend on the
-- project's Auth dashboard "Confirm email" toggle, stamp email_confirmed_at at
-- the moment the auth user is created via a BEFORE INSERT trigger on
-- auth.users, so the very first /signup yields a usable session.
--
-- Note: if you later want real email verification, drop this trigger and turn
-- on "Confirm email" in Supabase Auth settings instead.
-- Idempotent.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.erp_auto_confirm_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN
    NEW.email_confirmed_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS erp_auto_confirm_email ON auth.users;
CREATE TRIGGER erp_auto_confirm_email
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.erp_auto_confirm_email();
