-- ============================================================================
-- 0041: Fix NULL created_at/updated_at on auth.users (login schema error)
-- ----------------------------------------------------------------------------
-- Same class as 0040: direct INSERTs into auth.users didn't set created_at /
-- updated_at (no DB default), so GoTrue's user scan failed with
-- "Scan error on column ... created_at: storing <nil> into *time.Time"
-- → 500 "Database error querying schema". Backfill + default in the trigger.
-- ============================================================================

UPDATE auth.users
SET created_at = COALESCE(created_at, now()),
    updated_at = COALESCE(updated_at, now())
WHERE created_at IS NULL OR updated_at IS NULL;

CREATE OR REPLACE FUNCTION public.erp_auto_confirm_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN NEW.email_confirmed_at := now(); END IF;
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := COALESCE(NEW.updated_at, now());
  NEW.confirmation_token         := COALESCE(NEW.confirmation_token, '');
  NEW.recovery_token             := COALESCE(NEW.recovery_token, '');
  NEW.email_change_token_new     := COALESCE(NEW.email_change_token_new, '');
  NEW.email_change_token_current := COALESCE(NEW.email_change_token_current, '');
  NEW.email_change               := COALESCE(NEW.email_change, '');
  NEW.phone_change               := COALESCE(NEW.phone_change, '');
  NEW.phone_change_token         := COALESCE(NEW.phone_change_token, '');
  NEW.reauthentication_token     := COALESCE(NEW.reauthentication_token, '');
  RETURN NEW;
END;
$function$;
