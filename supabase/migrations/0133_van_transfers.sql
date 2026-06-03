-- ============================================================================
-- 0133: FMCG Operations — Van-to-van stock transfers (audited, approval-aware)
-- ----------------------------------------------------------------------------
-- Moves stock between two warehouses/vans. Low-value transfers can auto-approve
-- (per erp_fmcg_settings.van_transfer_auto_approve_below); larger ones wait for
-- an approver. Applying a transfer mirrors erp_approve_stock_request (0011)
-- exactly: a paired transfer_out / transfer_in pair of erp_stock_movements per
-- line — the AFTER INSERT trigger on erp_stock_movements upserts
-- erp_inventory_stock. Never lets a van go negative.
--
-- Write RPCs self-guard on tenant scope (warehouse->branch->company) + granular
-- permission via erp_user_has_perm() (from 0130).
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_van_transfers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  transfer_number   TEXT,
  from_warehouse_id UUID REFERENCES erp_warehouses(id) ON DELETE RESTRICT,
  to_warehouse_id   UUID REFERENCES erp_warehouses(id) ON DELETE RESTRICT,
  from_user         UUID,
  to_user           UUID,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','completed','cancelled')),
  total_value       NUMERIC(14,2) NOT NULL DEFAULT 0,
  reason            TEXT,
  requested_by      UUID,
  approved_by       UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_erp_van_transfers_company ON erp_van_transfers(company_id, status);
CREATE INDEX IF NOT EXISTS idx_erp_van_transfers_from ON erp_van_transfers(from_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_erp_van_transfers_to ON erp_van_transfers(to_warehouse_id);

CREATE TABLE IF NOT EXISTS erp_van_transfer_lines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES erp_van_transfers(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES erp_products_catalog(id) ON DELETE RESTRICT,
  quantity    NUMERIC(14,3) NOT NULL,
  unit_cost   NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_van_transfer_lines_transfer ON erp_van_transfer_lines(transfer_id);

DO $$
DECLARE t text;
BEGIN
  EXECUTE 'ALTER TABLE erp_van_transfers ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE erp_van_transfer_lines ENABLE ROW LEVEL SECURITY';

  EXECUTE 'DROP TRIGGER IF EXISTS erp_van_transfers_set_company ON erp_van_transfers';
  EXECUTE 'CREATE TRIGGER erp_van_transfers_set_company BEFORE INSERT ON erp_van_transfers FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()';
  EXECUTE 'DROP POLICY IF EXISTS erp_van_transfers_read ON erp_van_transfers';
  EXECUTE 'CREATE POLICY erp_van_transfers_read ON erp_van_transfers FOR SELECT USING (erp_is_platform_owner() OR company_id = erp_user_company_id())';
  EXECUTE 'DROP POLICY IF EXISTS erp_van_transfers_write ON erp_van_transfers';
  EXECUTE 'CREATE POLICY erp_van_transfers_write ON erp_van_transfers FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id()) WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id())';

  EXECUTE 'DROP POLICY IF EXISTS erp_van_transfer_lines_read ON erp_van_transfer_lines';
  EXECUTE 'CREATE POLICY erp_van_transfer_lines_read ON erp_van_transfer_lines FOR SELECT USING (transfer_id IN (SELECT id FROM erp_van_transfers WHERE erp_is_platform_owner() OR company_id = erp_user_company_id()))';
  EXECUTE 'DROP POLICY IF EXISTS erp_van_transfer_lines_write ON erp_van_transfer_lines';
  EXECUTE 'CREATE POLICY erp_van_transfer_lines_write ON erp_van_transfer_lines FOR ALL USING (transfer_id IN (SELECT id FROM erp_van_transfers WHERE erp_is_platform_owner() OR company_id = erp_user_company_id())) WITH CHECK (transfer_id IN (SELECT id FROM erp_van_transfers WHERE erp_is_platform_owner() OR company_id = erp_user_company_id()))';
END $$;

-- ── Internal: apply a transfer's stock movements (mirrors erp_approve_stock_request) ──
-- For each line: paired transfer_out (from) + transfer_in (to). The AFTER INSERT
-- trigger on erp_stock_movements upserts erp_inventory_stock. Guards against any
-- line exceeding available stock in the source van (no negative stock).
CREATE OR REPLACE FUNCTION erp_apply_van_transfer(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_t erp_van_transfers; v_uid uuid := auth.uid(); v_short record;
BEGIN
  SELECT * INTO v_t FROM erp_van_transfers WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transfer not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM erp_van_transfer_lines WHERE transfer_id = p_id) THEN
    RAISE EXCEPTION 'transfer has no lines';
  END IF;

  -- Guard: never allow negative stock in the source van.
  SELECT l.product_id, abs(l.quantity) AS need, COALESCE(st.quantity, 0) AS avail
    INTO v_short
    FROM erp_van_transfer_lines l
    LEFT JOIN erp_inventory_stock st
      ON st.warehouse_id = v_t.from_warehouse_id AND st.product_id = l.product_id
   WHERE l.transfer_id = p_id AND abs(l.quantity) > COALESCE(st.quantity, 0)
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'insufficient van stock for product % (need %, available %)',
      v_short.product_id, v_short.need, v_short.avail USING errcode = 'check_violation';
  END IF;

  INSERT INTO erp_stock_movements (movement_type, warehouse_id, product_id, quantity, reference_type, reference_id, notes, created_by)
  SELECT 'transfer_out', v_t.from_warehouse_id, l.product_id, -abs(l.quantity), 'van_transfer', p_id, 'تحويل بين العربات: ' || COALESCE(v_t.transfer_number, p_id::text), v_uid
  FROM erp_van_transfer_lines l WHERE l.transfer_id = p_id;

  INSERT INTO erp_stock_movements (movement_type, warehouse_id, product_id, quantity, reference_type, reference_id, notes, created_by)
  SELECT 'transfer_in', v_t.to_warehouse_id, l.product_id, abs(l.quantity), 'van_transfer', p_id, 'تحويل بين العربات: ' || COALESCE(v_t.transfer_number, p_id::text), v_uid
  FROM erp_van_transfer_lines l WHERE l.transfer_id = p_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_apply_van_transfer(uuid) FROM anon, public, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_apply_van_transfer(uuid) TO service_role;

-- ── Request a van transfer (auto-applies under the value threshold) ────────────
CREATE OR REPLACE FUNCTION erp_request_van_transfer(
  p_from_warehouse_id uuid, p_to_warehouse_id uuid, p_lines jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_co        uuid := erp_user_company_id();
  v_from      RECORD;
  v_to        RECORD;
  s           erp_fmcg_settings;
  v_id        uuid;
  v_line      record;
  v_pid       uuid;
  v_qty       numeric;
  v_cost      numeric;
  v_avail     numeric;
  v_total     numeric := 0;
  v_auto      boolean;
  v_status    text;
  v_number    text;
BEGIN
  IF NOT erp_user_has_perm('stock.transfer') THEN
    RAISE EXCEPTION 'not authorized: stock.transfer' USING errcode = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'transfer has no lines';
  END IF;

  SELECT w.*, b.company_id AS branch_company INTO v_from
    FROM erp_warehouses w JOIN erp_branches b ON b.id = w.branch_id
   WHERE w.id = p_from_warehouse_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'source warehouse not found'; END IF;
  SELECT w.*, b.company_id AS branch_company INTO v_to
    FROM erp_warehouses w JOIN erp_branches b ON b.id = w.branch_id
   WHERE w.id = p_to_warehouse_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'destination warehouse not found'; END IF;

  IF NOT erp_is_platform_owner() AND (v_from.branch_company IS DISTINCT FROM v_co
                                      OR v_to.branch_company IS DISTINCT FROM v_co) THEN
    RAISE EXCEPTION 'cross-tenant transfer denied' USING errcode = 'insufficient_privilege';
  END IF;
  v_co := COALESCE(v_co, v_from.branch_company);

  -- Validate availability + accumulate total value (default unit_cost = product cost_price).
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) AS e(val) LOOP
    v_pid := NULLIF(v_line.val->>'product_id','')::uuid;
    v_qty := COALESCE((v_line.val->>'quantity')::numeric, 0);
    IF v_pid IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'invalid transfer line (product_id/quantity)';
    END IF;
    v_cost := COALESCE((v_line.val->>'unit_cost')::numeric,
                       (SELECT cost_price FROM erp_products_catalog WHERE id = v_pid), 0);
    SELECT COALESCE(quantity, 0) INTO v_avail
      FROM erp_inventory_stock WHERE warehouse_id = p_from_warehouse_id AND product_id = v_pid;
    v_avail := COALESCE(v_avail, 0);
    IF abs(v_qty) > v_avail THEN
      RAISE EXCEPTION 'insufficient van stock for product % (need %, available %)',
        v_pid, abs(v_qty), v_avail USING errcode = 'check_violation';
    END IF;
    v_total := v_total + abs(v_qty) * v_cost;
  END LOOP;

  SELECT * INTO s FROM erp_fmcg_settings WHERE company_id = v_co;
  v_auto := (s.van_transfer_auto_approve_below IS NOT NULL AND v_total < s.van_transfer_auto_approve_below);
  v_status := CASE WHEN v_auto THEN 'completed' ELSE 'pending' END;

  INSERT INTO erp_van_transfers (
    company_id, from_warehouse_id, to_warehouse_id, from_user, to_user,
    status, total_value, requested_by, approved_by, decided_at, completed_at)
  VALUES (
    v_co, p_from_warehouse_id, p_to_warehouse_id, v_from.assigned_to, v_to.assigned_to,
    v_status, v_total, auth.uid(),
    CASE WHEN v_auto THEN auth.uid() ELSE NULL END,
    CASE WHEN v_auto THEN now() ELSE NULL END,
    NULL)
  RETURNING id INTO v_id;

  -- Generate a transfer number (branch-scoped erp_next_number if present, else fallback).
  BEGIN
    v_number := erp_next_number(v_from.branch_id, 'van_transfer');
  EXCEPTION WHEN undefined_function OR others THEN
    v_number := 'VT-' || left(v_id::text, 8);
  END;
  UPDATE erp_van_transfers SET transfer_number = v_number WHERE id = v_id;

  INSERT INTO erp_van_transfer_lines (transfer_id, product_id, quantity, unit_cost)
  SELECT v_id, NULLIF(e.val->>'product_id','')::uuid,
         abs((e.val->>'quantity')::numeric),
         COALESCE((e.val->>'unit_cost')::numeric,
                  (SELECT cost_price FROM erp_products_catalog WHERE id = NULLIF(e.val->>'product_id','')::uuid), 0)
  FROM jsonb_array_elements(p_lines) AS e(val);

  IF v_auto THEN
    PERFORM erp_apply_van_transfer(v_id);
    UPDATE erp_van_transfers SET completed_at = now() WHERE id = v_id;
  END IF;

  PERFORM erp_log_audit('request_van_transfer', 'van_transfer', v_id::text,
    jsonb_build_object('from_warehouse', p_from_warehouse_id, 'to_warehouse', p_to_warehouse_id,
      'total_value', v_total, 'auto_approved', v_auto, 'status', v_status), v_co);

  RETURN jsonb_build_object('transfer_id', v_id, 'status', v_status,
    'total_value', v_total, 'auto_approved', v_auto);
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_request_van_transfer(uuid, uuid, jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_request_van_transfer(uuid, uuid, jsonb) TO authenticated, service_role;

-- ── Approve a pending van transfer (applies the stock movements) ───────────────
CREATE OR REPLACE FUNCTION erp_approve_van_transfer(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_t erp_van_transfers;
BEGIN
  IF NOT erp_user_has_perm('stock.transfer.approve') THEN
    RAISE EXCEPTION 'not authorized: stock.transfer.approve' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_t FROM erp_van_transfers WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'transfer not found'; END IF;
  IF NOT erp_is_platform_owner() AND v_t.company_id IS DISTINCT FROM erp_user_company_id() THEN
    RAISE EXCEPTION 'cross-tenant denied' USING errcode = 'insufficient_privilege';
  END IF;
  IF v_t.status <> 'pending' THEN RAISE EXCEPTION 'transfer not pending'; END IF;

  UPDATE erp_van_transfers SET status = 'completed', approved_by = auth.uid(),
    decided_at = now(), completed_at = now() WHERE id = p_id;
  PERFORM erp_apply_van_transfer(p_id);

  PERFORM erp_log_audit('approve_van_transfer', 'van_transfer', p_id::text,
    jsonb_build_object('total_value', v_t.total_value), v_t.company_id);
  RETURN jsonb_build_object('transfer_id', p_id, 'status', 'completed');
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_approve_van_transfer(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_approve_van_transfer(uuid) TO authenticated, service_role;

-- ── Reject a pending van transfer ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION erp_reject_van_transfer(p_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_t erp_van_transfers;
BEGIN
  IF NOT erp_user_has_perm('stock.transfer.approve') THEN
    RAISE EXCEPTION 'not authorized: stock.transfer.approve' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_t FROM erp_van_transfers WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'transfer not found'; END IF;
  IF NOT erp_is_platform_owner() AND v_t.company_id IS DISTINCT FROM erp_user_company_id() THEN
    RAISE EXCEPTION 'cross-tenant denied' USING errcode = 'insufficient_privilege';
  END IF;
  IF v_t.status <> 'pending' THEN RAISE EXCEPTION 'transfer not pending'; END IF;

  UPDATE erp_van_transfers SET status = 'rejected', approved_by = auth.uid(),
    decided_at = now(), reason = COALESCE(p_reason, reason) WHERE id = p_id;

  PERFORM erp_log_audit('reject_van_transfer', 'van_transfer', p_id::text,
    jsonb_build_object('reason', p_reason), v_t.company_id);
  RETURN jsonb_build_object('transfer_id', p_id, 'status', 'rejected');
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_reject_van_transfer(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_reject_van_transfer(uuid, text) TO authenticated, service_role;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS erp_reject_van_transfer(uuid, text);
-- DROP FUNCTION IF EXISTS erp_approve_van_transfer(uuid);
-- DROP FUNCTION IF EXISTS erp_request_van_transfer(uuid, uuid, jsonb);
-- DROP FUNCTION IF EXISTS erp_apply_van_transfer(uuid);
-- DROP TABLE IF EXISTS erp_van_transfer_lines;
-- DROP TABLE IF EXISTS erp_van_transfers;
