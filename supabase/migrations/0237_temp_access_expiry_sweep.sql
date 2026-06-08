-- ============================================================================
-- 0237: Temporary access expiry sweep — stamp expired grants (non-destructive)
-- ----------------------------------------------------------------------------
-- Pre-pilot hardening (Step 2). Temporary access grants (0227) auto-expire by
-- time (effective_to), but nothing marks/audits the moment they lapse. This adds
-- an `expired_at` stamp + a guarded sweep that flags lapsed grants and records a
-- single aggregate audit entry. NON-DESTRUCTIVE — it stamps, never deletes — and
-- sets up the later governance-enforcement wiring (resolution filters on
-- effective_to >= now() AND expired_at IS NULL).
--
-- Function is service-role only; invoked by /api/internal/access-expiry-sweep
-- (CRON_SECRET-guarded). Additive. Depends on 0227, 0024 (erp_log_audit).
-- ============================================================================

ALTER TABLE erp_temporary_access_grants ADD COLUMN IF NOT EXISTS expired_at timestamptz;

CREATE OR REPLACE FUNCTION erp_sweep_expired_access()
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_count bigint;
BEGIN
  UPDATE erp_temporary_access_grants
     SET expired_at = now()
   WHERE effective_to < now() AND expired_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    PERFORM erp_log_audit('access.expiry_sweep', 'temporary_access_grant', NULL,
      jsonb_build_object('expired', v_count), NULL);
  END IF;
  RETURN v_count;
END $$;

REVOKE EXECUTE ON FUNCTION public.erp_sweep_expired_access() FROM anon, public, authenticated;
GRANT  EXECUTE ON FUNCTION public.erp_sweep_expired_access() TO service_role;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS erp_sweep_expired_access();
-- ALTER TABLE erp_temporary_access_grants DROP COLUMN IF EXISTS expired_at;
