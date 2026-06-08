-- ============================================================================
-- 0236: Audit log retention — bounded, non-destructive by default
-- ----------------------------------------------------------------------------
-- Pre-pilot hardening (Step 2). Adds a guarded purge function for erp_audit_logs.
-- It is INERT until an operator wires the cron route with AUDIT_RETENTION_DAYS —
-- nothing is deleted by this migration, and the function REFUSES windows < 1 day
-- so it can never wipe the log. Daily pg_dump backups (backup.yml) cover archival.
--
-- Function is service-role only (revoked from anon/public/authenticated) and is
-- invoked exclusively by /api/internal/audit-retention (CRON_SECRET-guarded).
-- Additive. Depends on 0024 (erp_audit_logs).
-- ============================================================================

CREATE OR REPLACE FUNCTION erp_purge_audit_logs(p_keep_days integer)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_deleted bigint;
BEGIN
  -- Safety: refuse to purge with a non-positive window (never wipe the log).
  IF p_keep_days IS NULL OR p_keep_days < 1 THEN
    RAISE EXCEPTION 'audit retention window must be >= 1 day (got %)', p_keep_days
      USING errcode = 'check_violation';
  END IF;
  DELETE FROM erp_audit_logs WHERE created_at < now() - make_interval(days => p_keep_days);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END $$;

REVOKE EXECUTE ON FUNCTION public.erp_purge_audit_logs(integer) FROM anon, public, authenticated;
GRANT  EXECUTE ON FUNCTION public.erp_purge_audit_logs(integer) TO service_role;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS erp_purge_audit_logs(integer);
