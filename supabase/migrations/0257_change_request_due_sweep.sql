-- ============================================================================
-- 0257: Change Request engine — Phase 6: effective-dating due sweep
-- ----------------------------------------------------------------------------
-- Refines erp_change_request_run_due() to drive effective dating end-to-end. It
-- now considers EVERY ready-or-pending request (status approved/scheduled) and
-- lets erp_change_request_apply gate each one: due (effective_at null/past) → the
-- change is applied; future-dated → parked as 'scheduled' until its date arrives.
-- This is also the production invoker of apply for immediate approvals. Returns
-- the number actually applied this run. Driven by a cron route (CRON_SECRET +
-- service role); also callable directly. Additive; INERT until KAKO_CHANGE_REQUESTS.
-- ============================================================================

CREATE OR REPLACE FUNCTION erp_change_request_run_due()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  rec record;
  res text;
  n int := 0;
BEGIN
  FOR rec IN
    SELECT id FROM erp_change_requests
    WHERE status IN ('approved', 'scheduled')
    ORDER BY created_at
  LOOP
    res := erp_change_request_apply(rec.id);   -- applies if due; parks future-dated as 'scheduled'
    IF res IN ('applied', 'partially_applied') THEN n := n + 1; END IF;
  END LOOP;
  RETURN n;
END
$$;

REVOKE ALL ON FUNCTION erp_change_request_run_due() FROM PUBLIC;

-- ── Rollback (manual): restore the 0255 definition (effective_at-filtered loop). ──
