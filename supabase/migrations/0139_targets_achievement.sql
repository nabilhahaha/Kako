-- ============================================================================
-- 0139: Value Acceleration Wave 1 — Targets & achievement
-- ----------------------------------------------------------------------------
-- A flexible, import-ready target table spanning any org level / period / metric,
-- plus a defensive achievement calculator that derives actuals from existing data
-- (invoices, visits, work sessions, customers, payments) WITHOUT assuming optional
-- tables exist. It returns achievement %, gap, remaining days, required run-rate
-- and a naive forecast. Commission is intentionally NOT computed here — a clear
-- extension point is marked instead.
--
-- erp_targets gets erp_set_company_id() BEFORE INSERT + erp_set_updated_at(),
-- company-scoped RLS. erp_target_achievement() is SECURITY DEFINER, perm-guarded
-- + tenant-scoped + null-tolerant. The legacy erp_rep_targets table is untouched.
-- Idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_targets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  level        TEXT NOT NULL CHECK (level IN
                 ('company','region','branch','manager','supervisor','salesman','customer','product','category')),
  scope_id     UUID,
  period       TEXT NOT NULL CHECK (period IN ('daily','weekly','monthly','quarterly')),
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  metric       TEXT NOT NULL CHECK (metric IN
                 ('sales_value','quantity','visits','coverage','strike_rate','new_customers','collections')),
  target_value NUMERIC(14,2) NOT NULL,
  created_by   UUID,
  updated_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_targets_lookup ON erp_targets(company_id, level, period_start);

DO $$
BEGIN
  EXECUTE 'ALTER TABLE erp_targets ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP TRIGGER IF EXISTS erp_targets_set_company ON erp_targets';
  EXECUTE 'CREATE TRIGGER erp_targets_set_company BEFORE INSERT ON erp_targets FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()';
  EXECUTE 'DROP TRIGGER IF EXISTS erp_targets_updated ON erp_targets';
  EXECUTE 'CREATE TRIGGER erp_targets_updated BEFORE UPDATE ON erp_targets FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at()';
  EXECUTE 'DROP POLICY IF EXISTS erp_targets_read ON erp_targets';
  EXECUTE 'CREATE POLICY erp_targets_read ON erp_targets FOR SELECT USING (erp_is_platform_owner() OR company_id = erp_user_company_id())';
  EXECUTE 'DROP POLICY IF EXISTS erp_targets_write ON erp_targets';
  EXECUTE 'CREATE POLICY erp_targets_write ON erp_targets FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id()) WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id())';
END $$;

-- ── erp_target_achievement: compute actual vs target for a target row ────────
-- Defensive & null-tolerant. Scoping by level: branch→branch_id, salesman/
-- manager/supervisor→salesman_id, customer→customer_id; other levels aggregate
-- company-wide within the period. Metrics map to existing data:
--   sales_value/quantity → erp_invoices(+lines) via branch→company
--   visits/coverage      → erp_visits / erp_work_sessions
--   new_customers        → erp_customers.created_at
--   collections          → erp_payments (only if reachable; else actual=null+note)
-- erp_invoices/erp_payments/erp_visits/erp_work_sessions/erp_customers are all
-- branch-scoped (company resolved via erp_branches.company_id).
CREATE OR REPLACE FUNCTION erp_target_achievement(p_target_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_co        uuid := erp_user_company_id();
  v_t         erp_targets;
  v_actual    numeric;
  v_note      text := NULL;
  v_pct       numeric;
  v_gap       numeric;
  v_remaining int;
  v_elapsed   int;
  v_run_rate  numeric;
  v_forecast  numeric;
  v_total_days int;
BEGIN
  IF NOT erp_user_has_perm('target.view') THEN
    RAISE EXCEPTION 'not authorized: target.view' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_t FROM erp_targets WHERE id = p_target_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'target not found'; END IF;
  IF NOT erp_is_platform_owner() AND v_t.company_id IS DISTINCT FROM v_co THEN
    RAISE EXCEPTION 'cross-tenant denied' USING errcode = 'insufficient_privilege';
  END IF;

  IF v_t.metric = 'sales_value' THEN
    SELECT COALESCE(SUM(i.net_amount), 0) INTO v_actual
      FROM erp_invoices i JOIN erp_branches b ON b.id = i.branch_id
     WHERE b.company_id = v_t.company_id
       AND i.created_at::date BETWEEN v_t.period_start AND v_t.period_end
       AND (v_t.level <> 'branch'   OR i.branch_id   = v_t.scope_id)
       AND (v_t.level <> 'customer' OR i.customer_id = v_t.scope_id);

  ELSIF v_t.metric = 'quantity' THEN
    SELECT COALESCE(SUM(il.quantity), 0) INTO v_actual
      FROM erp_invoice_lines il
      JOIN erp_invoices i ON i.id = il.invoice_id
      JOIN erp_branches b ON b.id = i.branch_id
     WHERE b.company_id = v_t.company_id
       AND i.created_at::date BETWEEN v_t.period_start AND v_t.period_end
       AND (v_t.level <> 'branch'   OR i.branch_id   = v_t.scope_id)
       AND (v_t.level <> 'customer' OR i.customer_id = v_t.scope_id);

  ELSIF v_t.metric = 'visits' THEN
    SELECT COALESCE(COUNT(*), 0) INTO v_actual
      FROM erp_visits vv JOIN erp_branches b ON b.id = vv.branch_id
     WHERE b.company_id = v_t.company_id
       AND vv.visit_date BETWEEN v_t.period_start AND v_t.period_end
       AND (v_t.level NOT IN ('salesman','manager','supervisor') OR vv.salesman_id = v_t.scope_id)
       AND (v_t.level <> 'branch'   OR vv.branch_id   = v_t.scope_id)
       AND (v_t.level <> 'customer' OR vv.customer_id = v_t.scope_id);

  ELSIF v_t.metric = 'coverage' THEN
    SELECT AVG(ws.coverage_pct) INTO v_actual
      FROM erp_work_sessions ws JOIN erp_branches b ON b.id = ws.branch_id
     WHERE b.company_id = v_t.company_id
       AND ws.work_date BETWEEN v_t.period_start AND v_t.period_end
       AND (v_t.level NOT IN ('salesman','manager','supervisor') OR ws.salesman_id = v_t.scope_id)
       AND (v_t.level <> 'branch' OR ws.branch_id = v_t.scope_id);

  ELSIF v_t.metric = 'strike_rate' THEN
    -- % of visits that produced an invoice (no_sale = false ⇒ effective).
    SELECT CASE WHEN COUNT(*) = 0 THEN 0
                ELSE 100.0 * SUM(CASE WHEN vv.invoice_id IS NOT NULL OR NOT vv.no_sale THEN 1 ELSE 0 END) / COUNT(*)
           END INTO v_actual
      FROM erp_visits vv JOIN erp_branches b ON b.id = vv.branch_id
     WHERE b.company_id = v_t.company_id
       AND vv.visit_date BETWEEN v_t.period_start AND v_t.period_end
       AND (v_t.level NOT IN ('salesman','manager','supervisor') OR vv.salesman_id = v_t.scope_id)
       AND (v_t.level <> 'branch' OR vv.branch_id = v_t.scope_id);

  ELSIF v_t.metric = 'new_customers' THEN
    SELECT COALESCE(COUNT(*), 0) INTO v_actual
      FROM erp_customers c JOIN erp_branches b ON b.id = c.branch_id
     WHERE b.company_id = v_t.company_id
       AND c.created_at::date BETWEEN v_t.period_start AND v_t.period_end
       AND (v_t.level <> 'branch' OR c.branch_id = v_t.scope_id);

  ELSIF v_t.metric = 'collections' THEN
    -- erp_payments → invoice → branch → company (defensive; null on any failure).
    BEGIN
      SELECT COALESCE(SUM(p.amount), 0) INTO v_actual
        FROM erp_payments p
        JOIN erp_invoices i ON i.id = p.invoice_id
        JOIN erp_branches b ON b.id = i.branch_id
       WHERE b.company_id = v_t.company_id
         AND p.payment_date BETWEEN v_t.period_start AND v_t.period_end
         AND (v_t.level <> 'branch'   OR i.branch_id   = v_t.scope_id)
         AND (v_t.level <> 'customer' OR i.customer_id = v_t.scope_id);
    EXCEPTION WHEN undefined_table OR undefined_column THEN
      v_actual := NULL; v_note := 'collections source unavailable';
    END;

  ELSE
    v_actual := NULL; v_note := 'unsupported metric';
  END IF;

  -- Period math (defensive against zero-length periods).
  v_total_days := GREATEST((v_t.period_end - v_t.period_start) + 1, 1);
  v_remaining  := GREATEST((v_t.period_end - CURRENT_DATE) + 1, 0);
  v_elapsed    := GREATEST(v_total_days - v_remaining, 0);

  IF v_actual IS NOT NULL AND v_t.target_value <> 0 THEN
    v_pct := ROUND(100.0 * v_actual / v_t.target_value, 2);
  ELSE
    v_pct := NULL;
  END IF;
  v_gap := CASE WHEN v_actual IS NULL THEN NULL ELSE v_t.target_value - v_actual END;
  v_run_rate := CASE WHEN v_gap IS NULL OR v_remaining = 0 THEN NULL ELSE ROUND(GREATEST(v_gap,0) / v_remaining, 2) END;
  v_forecast := CASE WHEN v_actual IS NULL OR v_elapsed = 0 THEN NULL
                     ELSE ROUND(v_actual * v_total_days::numeric / v_elapsed, 2) END;

  -- ── COMMISSION EXTENSION POINT ─────────────────────────────────────────────
  -- A future migration can layer commission on top of this achievement result
  -- (e.g. tiered % of v_actual or of achievement_pct). Intentionally NOT computed
  -- here — this function reports achievement only.

  RETURN jsonb_build_object(
    'target', v_t.target_value,
    'actual', v_actual,
    'achievement_pct', v_pct,
    'gap', v_gap,
    'remaining_days', v_remaining,
    'required_daily_run_rate', v_run_rate,
    'forecast', v_forecast,
    'note', v_note
  );
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_target_achievement(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_target_achievement(uuid) TO authenticated, service_role;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS erp_target_achievement(uuid);
-- DROP TABLE IF EXISTS erp_targets;
