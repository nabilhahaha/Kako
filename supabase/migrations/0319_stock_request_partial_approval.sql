-- 0319 — Stock request PARTIAL approval (honor approved_qty).
--
-- WHAT: erp_approve_stock_request now moves the APPROVED quantity per line
-- (erp_stock_request_lines.approved_qty), falling back to the requested quantity
-- when the approver made no adjustment, and SKIPPING lines reduced to 0 (removed by
-- the approver). Previously it always moved the full requested quantity, so the
-- per-line adjuster (adjustStockRequest, which already records approved_qty + a
-- full before/after audit) had no effect on the actual stock movement.
--
-- WHY: makes partial approval real end-to-end — Requested vs Approved is now what
-- physically loads onto the van.
--
-- Preserves: SECURITY DEFINER, branch-access + pending-status guards, and the
-- 0314 flag-gated rpc guard (`erp_guard_rpc('stock_request.approve')`).
-- Additive + idempotent (CREATE OR REPLACE). Rollback: restore the prior body.

CREATE OR REPLACE FUNCTION erp_approve_stock_request(p_request_id UUID)
RETURNS VOID AS $$
DECLARE
  v_r erp_stock_requests;
  v_uid UUID := auth.uid();
BEGIN
  PERFORM erp_guard_rpc('stock_request.approve');

  SELECT * INTO v_r FROM erp_stock_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;
  IF NOT erp_has_branch_access(v_r.branch_id) THEN RAISE EXCEPTION 'غير مصرح بالوصول لهذا الفرع'; END IF;
  IF v_r.status <> 'pending' THEN RAISE EXCEPTION 'لا يمكن اعتماد إلا الطلبات المعلّقة'; END IF;
  IF NOT EXISTS (SELECT 1 FROM erp_stock_request_lines WHERE request_id = p_request_id) THEN
    RAISE EXCEPTION 'الطلب بلا بنود';
  END IF;
  -- Effective qty = COALESCE(approved_qty, quantity); a full partial-reject (all 0)
  -- has nothing to load.
  IF NOT EXISTS (
    SELECT 1 FROM erp_stock_request_lines l
     WHERE l.request_id = p_request_id AND COALESCE(l.approved_qty, l.quantity) > 0
  ) THEN
    RAISE EXCEPTION 'لا توجد كميات معتمدة للتحميل';
  END IF;

  INSERT INTO erp_stock_movements (movement_type, warehouse_id, product_id, quantity, reference_type, reference_id, notes, created_by)
  SELECT 'transfer_out', v_r.from_warehouse_id, l.product_id, -abs(COALESCE(l.approved_qty, l.quantity)), 'stock_request', p_request_id, 'تحميل مندوب: ' || v_r.request_number, v_uid
  FROM erp_stock_request_lines l
  WHERE l.request_id = p_request_id AND COALESCE(l.approved_qty, l.quantity) > 0;

  INSERT INTO erp_stock_movements (movement_type, warehouse_id, product_id, quantity, reference_type, reference_id, notes, created_by)
  SELECT 'transfer_in', v_r.to_warehouse_id, l.product_id, abs(COALESCE(l.approved_qty, l.quantity)), 'stock_request', p_request_id, 'تحميل مندوب: ' || v_r.request_number, v_uid
  FROM erp_stock_request_lines l
  WHERE l.request_id = p_request_id AND COALESCE(l.approved_qty, l.quantity) > 0;

  UPDATE erp_stock_requests SET status = 'approved', approved_by = v_uid WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
