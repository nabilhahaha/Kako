-- ============================================================================
-- 0011: Van warehouses + stock load requests
-- ----------------------------------------------------------------------------
-- A van is a warehouse flagged is_van and assigned to a rep. A rep raises a
-- stock request to load products from a source warehouse into their van; a
-- warehouse keeper / manager approves, which moves the stock (transfer_out
-- from source + transfer_in to van). Safe to re-run.
-- ============================================================================

ALTER TABLE erp_warehouses
  ADD COLUMN IF NOT EXISTS is_van BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_erp_warehouses_assigned_to ON erp_warehouses(assigned_to);

CREATE TABLE IF NOT EXISTS erp_stock_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number    TEXT NOT NULL,
  branch_id         UUID NOT NULL REFERENCES erp_branches(id) ON DELETE CASCADE,
  from_warehouse_id UUID NOT NULL REFERENCES erp_warehouses(id) ON DELETE RESTRICT,
  to_warehouse_id   UUID NOT NULL REFERENCES erp_warehouses(id) ON DELETE RESTRICT,
  status            TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected | cancelled
  notes             TEXT,
  requested_by      UUID,
  approved_by       UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_stock_requests_branch ON erp_stock_requests(branch_id);
CREATE INDEX IF NOT EXISTS idx_erp_stock_requests_status ON erp_stock_requests(status);
CREATE INDEX IF NOT EXISTS idx_erp_stock_requests_to ON erp_stock_requests(to_warehouse_id);

DROP TRIGGER IF EXISTS erp_stock_requests_updated ON erp_stock_requests;
CREATE TRIGGER erp_stock_requests_updated BEFORE UPDATE ON erp_stock_requests
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

CREATE TABLE IF NOT EXISTS erp_stock_request_lines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID NOT NULL REFERENCES erp_stock_requests(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES erp_products_catalog(id) ON DELETE RESTRICT,
  quantity    NUMERIC(14,3) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_stock_request_lines_req ON erp_stock_request_lines(request_id);

ALTER TABLE erp_stock_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_stock_request_lines ENABLE ROW LEVEL SECURITY;

-- Visible to branch members (rep sees their branch's requests; approver too).
DROP POLICY IF EXISTS "erp_stock_requests_all" ON erp_stock_requests;
CREATE POLICY "erp_stock_requests_all" ON erp_stock_requests FOR ALL
  USING (branch_id = ANY(erp_user_branch_ids()));

DROP POLICY IF EXISTS "erp_stock_request_lines_all" ON erp_stock_request_lines;
CREATE POLICY "erp_stock_request_lines_all" ON erp_stock_request_lines FOR ALL
  USING (request_id IN (SELECT r.id FROM erp_stock_requests r WHERE r.branch_id = ANY(erp_user_branch_ids())));

-- Approve: move stock from source warehouse to the van (paired movements).
CREATE OR REPLACE FUNCTION erp_approve_stock_request(p_request_id UUID)
RETURNS VOID AS $$
DECLARE
  v_r erp_stock_requests;
  v_uid UUID := auth.uid();
BEGIN
  SELECT * INTO v_r FROM erp_stock_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;
  IF NOT erp_has_branch_access(v_r.branch_id) THEN RAISE EXCEPTION 'غير مصرح بالوصول لهذا الفرع'; END IF;
  IF v_r.status <> 'pending' THEN RAISE EXCEPTION 'لا يمكن اعتماد إلا الطلبات المعلّقة'; END IF;
  IF NOT EXISTS (SELECT 1 FROM erp_stock_request_lines WHERE request_id = p_request_id) THEN
    RAISE EXCEPTION 'الطلب بلا بنود';
  END IF;

  INSERT INTO erp_stock_movements (movement_type, warehouse_id, product_id, quantity, reference_type, reference_id, notes, created_by)
  SELECT 'transfer_out', v_r.from_warehouse_id, l.product_id, -abs(l.quantity), 'stock_request', p_request_id, 'تحميل مندوب: ' || v_r.request_number, v_uid
  FROM erp_stock_request_lines l WHERE l.request_id = p_request_id;

  INSERT INTO erp_stock_movements (movement_type, warehouse_id, product_id, quantity, reference_type, reference_id, notes, created_by)
  SELECT 'transfer_in', v_r.to_warehouse_id, l.product_id, abs(l.quantity), 'stock_request', p_request_id, 'تحميل مندوب: ' || v_r.request_number, v_uid
  FROM erp_stock_request_lines l WHERE l.request_id = p_request_id;

  UPDATE erp_stock_requests SET status = 'approved', approved_by = v_uid WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
