-- ============================================================================
-- 0138: Value Acceleration Wave 1 — Van reconciliation & settlement
-- ----------------------------------------------------------------------------
-- FOUNDATION ONLY: records the physical-vs-system variance of a van's stock at
-- day end, computed against the LIVE van balance in erp_inventory_stock (which
-- already reflects loads / sales / returns / transfers via erp_stock_movements).
-- It does NOT post any stock adjustment automatically — it captures the variance
-- for review/settlement. A configurable per-company threshold
-- (erp_fmcg_settings.recon_approval_threshold; null = never require) decides
-- whether a recon needs approval ('pending_approval') or can stay 'draft'.
--
-- Tables get erp_set_company_id() BEFORE INSERT + erp_set_updated_at(),
-- company-scoped RLS. Write RPCs self-guard on perm (erp_user_has_perm) + tenant
-- scope; SECURITY DEFINER, locked down. Idempotent.
-- ============================================================================

-- Per-company variance threshold above which a recon must be approved.
ALTER TABLE erp_fmcg_settings ADD COLUMN IF NOT EXISTS recon_approval_threshold NUMERIC(14,2);

CREATE TABLE IF NOT EXISTS erp_van_reconciliations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  work_session_id      UUID NOT NULL REFERENCES erp_work_sessions(id) ON DELETE CASCADE,
  warehouse_id         UUID REFERENCES erp_warehouses(id) ON DELETE SET NULL,
  salesman_id          UUID,
  recon_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  status               TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','pending_approval','settled','rejected')),
  total_variance_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  approved_by          UUID,
  decided_at           TIMESTAMPTZ,
  created_by           UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (work_session_id)
);
CREATE INDEX IF NOT EXISTS idx_erp_van_recon_company ON erp_van_reconciliations(company_id, status);
CREATE INDEX IF NOT EXISTS idx_erp_van_recon_session ON erp_van_reconciliations(work_session_id);

CREATE TABLE IF NOT EXISTS erp_van_reconciliation_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id UUID NOT NULL REFERENCES erp_van_reconciliations(id) ON DELETE CASCADE,
  product_id        UUID REFERENCES erp_products_catalog(id) ON DELETE RESTRICT,
  expected_qty      NUMERIC(14,3) NOT NULL DEFAULT 0,
  actual_qty        NUMERIC(14,3) NOT NULL DEFAULT 0,
  variance_qty      NUMERIC(14,3) NOT NULL DEFAULT 0,
  unit_cost         NUMERIC(14,2) NOT NULL DEFAULT 0,
  variance_value    NUMERIC(14,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_erp_van_recon_lines_recon ON erp_van_reconciliation_lines(reconciliation_id);

DO $$
BEGIN
  EXECUTE 'ALTER TABLE erp_van_reconciliations ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE erp_van_reconciliation_lines ENABLE ROW LEVEL SECURITY';

  EXECUTE 'DROP TRIGGER IF EXISTS erp_van_reconciliations_set_company ON erp_van_reconciliations';
  EXECUTE 'CREATE TRIGGER erp_van_reconciliations_set_company BEFORE INSERT ON erp_van_reconciliations FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()';
  EXECUTE 'DROP TRIGGER IF EXISTS erp_van_reconciliations_updated ON erp_van_reconciliations';
  EXECUTE 'CREATE TRIGGER erp_van_reconciliations_updated BEFORE UPDATE ON erp_van_reconciliations FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at()';
  EXECUTE 'DROP POLICY IF EXISTS erp_van_reconciliations_read ON erp_van_reconciliations';
  EXECUTE 'CREATE POLICY erp_van_reconciliations_read ON erp_van_reconciliations FOR SELECT USING (erp_is_platform_owner() OR company_id = erp_user_company_id())';
  EXECUTE 'DROP POLICY IF EXISTS erp_van_reconciliations_write ON erp_van_reconciliations';
  EXECUTE 'CREATE POLICY erp_van_reconciliations_write ON erp_van_reconciliations FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id()) WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id())';

  EXECUTE 'DROP POLICY IF EXISTS erp_van_recon_lines_read ON erp_van_reconciliation_lines';
  EXECUTE 'CREATE POLICY erp_van_recon_lines_read ON erp_van_reconciliation_lines FOR SELECT USING (reconciliation_id IN (SELECT id FROM erp_van_reconciliations WHERE erp_is_platform_owner() OR company_id = erp_user_company_id()))';
  EXECUTE 'DROP POLICY IF EXISTS erp_van_recon_lines_write ON erp_van_reconciliation_lines';
  EXECUTE 'CREATE POLICY erp_van_recon_lines_write ON erp_van_reconciliation_lines FOR ALL USING (reconciliation_id IN (SELECT id FROM erp_van_reconciliations WHERE erp_is_platform_owner() OR company_id = erp_user_company_id())) WITH CHECK (reconciliation_id IN (SELECT id FROM erp_van_reconciliations WHERE erp_is_platform_owner() OR company_id = erp_user_company_id()))';
END $$;

-- ── Compute (upsert) a van reconciliation from physical counts ───────────────
-- p_actuals = [{product_id, actual_qty}, ...]. expected = live van balance in
-- erp_inventory_stock for the session's van warehouse. Variance is recorded only
-- (no stock adjustment posted). status = pending_approval when total exceeds the
-- company threshold, else draft.
CREATE OR REPLACE FUNCTION erp_compute_van_reconciliation(p_work_session_id uuid, p_actuals jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_co        uuid := erp_user_company_id();
  v_sess      RECORD;
  v_wh        uuid;
  v_recon     uuid;
  v_threshold numeric;
  v_total     numeric := 0;
  v_expected  numeric := 0;
  v_count     int := 0;
  v_status    text;
BEGIN
  IF NOT erp_user_has_perm('reconciliation.manage') THEN
    RAISE EXCEPTION 'not authorized: reconciliation.manage' USING errcode = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(COALESCE(p_actuals,'null'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'p_actuals must be a json array';
  END IF;

  SELECT ws.*, b.company_id AS branch_company INTO v_sess
    FROM erp_work_sessions ws JOIN erp_branches b ON b.id = ws.branch_id
   WHERE ws.id = p_work_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'work session not found'; END IF;
  IF NOT erp_is_platform_owner() AND v_sess.branch_company IS DISTINCT FROM v_co THEN
    RAISE EXCEPTION 'cross-tenant denied' USING errcode = 'insufficient_privilege';
  END IF;
  v_co := COALESCE(v_co, v_sess.branch_company);

  -- Resolve the salesman's van warehouse (is_van + assigned_to), scoped to branch.
  SELECT w.id INTO v_wh
    FROM erp_warehouses w
   WHERE w.is_van AND w.assigned_to = v_sess.salesman_id
     AND (w.branch_id = v_sess.branch_id OR w.branch_id IS NULL)
   ORDER BY (w.branch_id = v_sess.branch_id) DESC
   LIMIT 1;

  -- Upsert the reconciliation header (one per work session); recompute lines.
  SELECT id INTO v_recon FROM erp_van_reconciliations WHERE work_session_id = p_work_session_id;
  IF v_recon IS NULL THEN
    INSERT INTO erp_van_reconciliations(company_id, work_session_id, warehouse_id, salesman_id, recon_date, status, created_by)
    VALUES (v_co, p_work_session_id, v_wh, v_sess.salesman_id, COALESCE(v_sess.work_date, CURRENT_DATE), 'draft', auth.uid())
    RETURNING id INTO v_recon;
  ELSE
    UPDATE erp_van_reconciliations SET warehouse_id = v_wh, salesman_id = v_sess.salesman_id WHERE id = v_recon;
    DELETE FROM erp_van_reconciliation_lines WHERE reconciliation_id = v_recon;
  END IF;

  -- One line per provided product: expected from live stock, variance recorded.
  INSERT INTO erp_van_reconciliation_lines(
    reconciliation_id, product_id, expected_qty, actual_qty, variance_qty, unit_cost, variance_value)
  SELECT
    v_recon,
    a.product_id,
    COALESCE(st.quantity, 0) AS expected_qty,
    a.actual_qty,
    a.actual_qty - COALESCE(st.quantity, 0) AS variance_qty,
    COALESCE(pc.cost_price, 0) AS unit_cost,
    (a.actual_qty - COALESCE(st.quantity, 0)) * COALESCE(pc.cost_price, 0) AS variance_value
  FROM (
    SELECT NULLIF(e.val->>'product_id','')::uuid AS product_id,
           COALESCE((e.val->>'actual_qty')::numeric, 0) AS actual_qty
    FROM jsonb_array_elements(p_actuals) AS e(val)
    WHERE NULLIF(e.val->>'product_id','') IS NOT NULL
  ) a
  LEFT JOIN erp_inventory_stock st ON st.warehouse_id = v_wh AND st.product_id = a.product_id
  LEFT JOIN erp_products_catalog pc ON pc.id = a.product_id;

  SELECT COALESCE(SUM(abs(variance_value)), 0), COALESCE(SUM(expected_qty), 0), COUNT(*)
    INTO v_total, v_expected, v_count
    FROM erp_van_reconciliation_lines WHERE reconciliation_id = v_recon;

  SELECT recon_approval_threshold INTO v_threshold FROM erp_fmcg_settings WHERE company_id = v_co;
  v_status := CASE WHEN v_threshold IS NOT NULL AND v_total > v_threshold THEN 'pending_approval' ELSE 'draft' END;

  UPDATE erp_van_reconciliations
     SET total_variance_value = v_total, status = v_status
   WHERE id = v_recon;

  PERFORM erp_log_audit('compute', 'van_reconciliation', v_recon::text,
    jsonb_build_object('work_session_id', p_work_session_id, 'warehouse_id', v_wh,
      'total_variance_value', v_total, 'line_count', v_count, 'status', v_status), v_co);

  RETURN jsonb_build_object('reconciliation_id', v_recon, 'expected_total', v_expected,
    'variance_value', v_total, 'line_count', v_count, 'status', v_status);
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_compute_van_reconciliation(uuid, jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_compute_van_reconciliation(uuid, jsonb) TO authenticated, service_role;

-- ── Settle a reconciliation ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION erp_settle_van_reconciliation(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_r erp_van_reconciliations;
BEGIN
  IF NOT erp_user_has_perm('reconciliation.approve') THEN
    RAISE EXCEPTION 'not authorized: reconciliation.approve' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_r FROM erp_van_reconciliations WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'reconciliation not found'; END IF;
  IF NOT erp_is_platform_owner() AND v_r.company_id IS DISTINCT FROM erp_user_company_id() THEN
    RAISE EXCEPTION 'cross-tenant denied' USING errcode = 'insufficient_privilege';
  END IF;
  IF v_r.status = 'settled' THEN RAISE EXCEPTION 'reconciliation already settled'; END IF;

  UPDATE erp_van_reconciliations
     SET status = 'settled', approved_by = auth.uid(), decided_at = now()
   WHERE id = p_id;

  PERFORM erp_log_audit('settle', 'van_reconciliation', p_id::text,
    jsonb_build_object('total_variance_value', v_r.total_variance_value), v_r.company_id);
  RETURN jsonb_build_object('reconciliation_id', p_id, 'status', 'settled');
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_settle_van_reconciliation(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_settle_van_reconciliation(uuid) TO authenticated, service_role;

-- ── Reject a reconciliation ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION erp_reject_van_reconciliation(p_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_r erp_van_reconciliations;
BEGIN
  IF NOT erp_user_has_perm('reconciliation.approve') THEN
    RAISE EXCEPTION 'not authorized: reconciliation.approve' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_r FROM erp_van_reconciliations WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'reconciliation not found'; END IF;
  IF NOT erp_is_platform_owner() AND v_r.company_id IS DISTINCT FROM erp_user_company_id() THEN
    RAISE EXCEPTION 'cross-tenant denied' USING errcode = 'insufficient_privilege';
  END IF;
  IF v_r.status = 'settled' THEN RAISE EXCEPTION 'reconciliation already settled'; END IF;

  UPDATE erp_van_reconciliations
     SET status = 'rejected', approved_by = auth.uid(), decided_at = now()
   WHERE id = p_id;

  PERFORM erp_log_audit('reject', 'van_reconciliation', p_id::text,
    jsonb_build_object('reason', p_reason), v_r.company_id);
  RETURN jsonb_build_object('reconciliation_id', p_id, 'status', 'rejected');
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_reject_van_reconciliation(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_reject_van_reconciliation(uuid, text) TO authenticated, service_role;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS erp_reject_van_reconciliation(uuid, text);
-- DROP FUNCTION IF EXISTS erp_settle_van_reconciliation(uuid);
-- DROP FUNCTION IF EXISTS erp_compute_van_reconciliation(uuid, jsonb);
-- DROP TABLE IF EXISTS erp_van_reconciliation_lines;
-- DROP TABLE IF EXISTS erp_van_reconciliations;
-- ALTER TABLE erp_fmcg_settings DROP COLUMN IF EXISTS recon_approval_threshold;
