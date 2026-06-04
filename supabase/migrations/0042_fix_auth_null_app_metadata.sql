-- ============================================================================
-- 0042: Fix NULL raw_app_meta_data on auth.users (login schema error)
-- ----------------------------------------------------------------------------
-- Final piece: direct INSERTs left raw_app_meta_data NULL. GoTrue expects a
-- JSON object ({"provider":"email","providers":["email"]}). Backfill + default
-- both metadata columns in the auto-confirm trigger. Idempotent. After this,
-- the only column still NULL on a freshly-seeded user is last_sign_in_at, which
-- is expected (set on first login) and nullable.
-- ============================================================================

UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, jsonb_build_object('provider','email','providers', jsonb_build_array('email'))),
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
WHERE raw_app_meta_data IS NULL OR raw_user_meta_data IS NULL;

CREATE OR REPLACE FUNCTION public.erp_auto_confirm_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN NEW.email_confirmed_at := now(); END IF;
  NEW.created_at := COALESCE(NEW.created_at, now());
  NEW.updated_at := COALESCE(NEW.updated_at, now());
  NEW.raw_app_meta_data := COALESCE(NEW.raw_app_meta_data, jsonb_build_object('provider','email','providers', jsonb_build_array('email')));
  NEW.raw_user_meta_data := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
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
