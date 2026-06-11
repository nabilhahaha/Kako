-- ============================================================================
-- VANTORA — post-schema-apply role grants (Supabase PostgREST roles)
-- ----------------------------------------------------------------------------
-- A real Supabase project pre-configures ALTER DEFAULT PRIVILEGES so that tables
-- created by `postgres` automatically grant access to the API roles (anon,
-- authenticated, service_role). Our fresh-apply path runs
-- `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` — which DROPS that
-- default-privilege configuration. Every table then created has NO grants, so
-- the app logs in (GoTrue) but every data query returns "permission denied",
-- and the post-login flow can't load the profile/company.
--
-- This script restores the standard Supabase grant model. RLS remains the
-- security boundary (these tables have RLS enabled); GRANT only lets a role
-- attempt access, after which RLS filters the rows. Idempotent — safe to re-run.
--
-- Run AFTER legacy-base.sql + all migrations, BEFORE seeding/using the app.
-- ============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- Future objects created by postgres inherit the same grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

DO $verify$
DECLARE missing int;
BEGIN
  SELECT count(*) INTO missing
  FROM pg_tables
  WHERE schemaname='public'
    AND NOT has_table_privilege('authenticated', format('%I.%I',schemaname,tablename), 'SELECT');
  IF missing > 0 THEN
    RAISE EXCEPTION 'GRANT verification failed — % public tables still unreadable by authenticated', missing;
  END IF;
  RAISE NOTICE '════ GRANTS OK — all public tables reachable by authenticated (RLS still enforces rows) ════';
END $verify$;
