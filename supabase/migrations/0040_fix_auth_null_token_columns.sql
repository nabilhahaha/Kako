-- ============================================================================
-- 0040: Prevent "Database error querying schema" on login
-- ----------------------------------------------------------------------------
-- GoTrue scans several auth.users token columns into Go strings; if any are
-- NULL it fails with 500 "Database error querying schema" / "converting NULL to
-- string is unsupported". Rows created by direct INSERTs (self-register, demo
-- seeding) left these NULL. Extend the existing BEFORE INSERT auto-confirm
-- trigger to also default these columns to '' so future inserts are safe.
-- Existing rows were backfilled with:
--   UPDATE auth.users SET confirmation_token=COALESCE(confirmation_token,''), ...
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
  -- GoTrue cannot scan NULL into these string columns; ensure empty strings.
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

-- Backfill any existing rows left with NULL tokens.
UPDATE auth.users SET
  confirmation_token         = COALESCE(confirmation_token, ''),
  recovery_token             = COALESCE(recovery_token, ''),
  email_change_token_new     = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  email_change               = COALESCE(email_change, ''),
  phone_change               = COALESCE(phone_change, ''),
  phone_change_token         = COALESCE(phone_change_token, ''),
  reauthentication_token     = COALESCE(reauthentication_token, '')
WHERE confirmation_token IS NULL OR recovery_token IS NULL
   OR email_change_token_new IS NULL OR email_change IS NULL;
