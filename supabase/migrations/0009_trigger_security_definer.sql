-- 0009 — Make trigger functions SECURITY DEFINER
--
-- WHY:
--   The AFTER-INSERT trigger on van_stock_uploads runs prune_van_stock_uploads()
--   which performs a DELETE. With SECURITY INVOKER (Postgres' default), that
--   DELETE executes AS the caller — which for an RM/TM user is role
--   'authenticated'. We grant only SELECT + INSERT to authenticated on
--   van_stock_uploads, so the trigger's DELETE raises
--       permission denied for table van_stock_uploads
--   and the whole INSERT statement aborts. That's the bug.
--
--   recompute_visit_status() has the same shape: when TM/RM updates a
--   visit_item, the trigger fires UPDATE on visits. RLS on visits doesn't
--   include TM/RM in the UPDATE policy, so the trigger silently rolls back
--   to 0 affected rows — visits.status never gets rolled up to pending_roshen
--   or completed.
--
-- FIX:
--   SECURITY DEFINER makes a function run as its OWNER (postgres in this
--   project), which holds all privileges and bypasses RLS. This is the
--   standard pattern for trigger maintenance functions. We also pin
--   search_path so an attacker can't shadow tables via a schema injection.

alter function public.prune_van_stock_uploads() security definer;
alter function public.recompute_visit_status()  security definer;

alter function public.prune_van_stock_uploads() set search_path = public, pg_temp;
alter function public.recompute_visit_status()  set search_path = public, pg_temp;

-- ─── Sanity (read-only) ───
-- These should print 'definer' once the migration succeeds:
--
-- SELECT proname, prosecdef AS is_security_definer
-- FROM pg_proc
-- WHERE proname IN ('prune_van_stock_uploads', 'recompute_visit_status');
