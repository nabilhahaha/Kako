-- ============================================================================
-- 0119: Retention / cleanup jobs (scalability — bound append-only growth)
-- ----------------------------------------------------------------------------
-- erp_notifications, erp_workflow_tasks/instances grow without bound. This adds
-- a conservative purge function + a daily pg_cron schedule (defensive — no-op if
-- pg_cron is unavailable; run via the app/Vercel cron fallback otherwise).
-- AUDIT LOGS ARE INTENTIONALLY RETAINED (compliance/support) — archive later.
-- ============================================================================

CREATE OR REPLACE FUNCTION erp_purge_old_data(
  p_notif_days   INT DEFAULT 90,
  p_workflow_days INT DEFAULT 180
)
RETURNS TABLE(notifications_deleted BIGINT, tasks_deleted BIGINT, instances_deleted BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE n BIGINT; tk BIGINT; ins BIGINT;
BEGIN
  -- Read notifications past the window (unread are kept).
  DELETE FROM erp_notifications
   WHERE is_read = true AND created_at < now() - make_interval(days => p_notif_days);
  GET DIAGNOSTICS n = ROW_COUNT;

  -- Tasks of long-finished workflow instances (children first to respect FK).
  DELETE FROM erp_workflow_tasks t
   USING erp_workflow_instances i
   WHERE t.instance_id = i.id
     AND i.status <> 'pending' AND i.completed_at IS NOT NULL
     AND i.completed_at < now() - make_interval(days => p_workflow_days);
  GET DIAGNOSTICS tk = ROW_COUNT;

  DELETE FROM erp_workflow_instances i
   WHERE i.status <> 'pending' AND i.completed_at IS NOT NULL
     AND i.completed_at < now() - make_interval(days => p_workflow_days);
  GET DIAGNOSTICS ins = ROW_COUNT;

  RETURN QUERY SELECT n, tk, ins;
END $$;

REVOKE EXECUTE ON FUNCTION public.erp_purge_old_data(int, int) FROM anon, authenticated, public;

-- Daily schedule (defensive: no-op + notice if pg_cron is unavailable).
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  BEGIN PERFORM cron.unschedule('erp-purge-old-data'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('erp-purge-old-data', '30 3 * * *', 'SELECT erp_purge_old_data();');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron unavailable (%); run erp_purge_old_data() via app/Vercel cron fallback.', sqlerrm;
END $$;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DO $$ BEGIN PERFORM cron.unschedule('erp-purge-old-data'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
-- DROP FUNCTION IF EXISTS erp_purge_old_data(int, int);
