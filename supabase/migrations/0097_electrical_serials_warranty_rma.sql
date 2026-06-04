-- ============================================================================
-- 0097: Electrical Retail & Wholesale Pack — Sub-slice B
--       (serial numbers + warranty + RMA)
-- ----------------------------------------------------------------------------
-- ADDITIVE + idempotent. Builds the serial-tracking spine on top of the EXISTING
-- inventory ledger and the sales/purchase-return flows (0005 / 0008 / 0096).
-- No deletions, no change to any existing row's meaning, protected verticals
-- untouched. Serial capture is enforced ONLY when a product is is_serialized, so
-- every existing product and non-electrical tenant is unaffected.
--
--   1. Catalog flags: erp_products_catalog.is_serialized (default false),
--      .warranty_months.
--   2. erp_product_serials  — one row per physical unit; status enum; ledger-
--      driven lifecycle; optional per-serial unit_cost (valuation-compatible).
--   3. erp_warranties        — per serial OR (product+invoice); generated end_date.
--   4. erp_rma               — return-authorization workflow that ORCHESTRATES the
--      existing sales/purchase-return RPCs (no duplicate accounting).
--   5. erp_complete_transfer extended IN PLACE: updates a serial's warehouse_id
--      for serialized lines (guarded; non-serialized path unchanged).
--   6. erp_rma_set_status RPC (SECURITY DEFINER, pinned search_path, anon revoked).
--   7. Permission electrical.rma (+ group); admin/manager/technician.
-- ============================================================================

-- ─── Enums ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE erp_serial_status AS ENUM ('in_stock','sold','returned','rma','scrapped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE erp_rma_status AS ENUM ('requested','approved','received','repair','replace','refund','closed','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 1. Catalog flags (additive columns; defaults keep existing behaviour) ─────
ALTER TABLE erp_products_catalog ADD COLUMN IF NOT EXISTS is_serialized BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE erp_products_catalog ADD COLUMN IF NOT EXISTS warranty_months INTEGER;

-- ─── 2. Serials ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_product_serials (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES erp_products_catalog(id) ON DELETE RESTRICT,
  serial_no     TEXT NOT NULL,
  imei          TEXT,
  status        erp_serial_status NOT NULL DEFAULT 'in_stock',
  warehouse_id  UUID REFERENCES erp_warehouses(id) ON DELETE SET NULL,
  unit_cost     NUMERIC(14,2),
  purchase_ref  UUID,
  sale_ref      UUID,
  customer_id   UUID REFERENCES erp_customers(id) ON DELETE SET NULL,
  received_at   TIMESTAMPTZ,
  sold_at       TIMESTAMPTZ,
  external_id   TEXT,
  created_by    UUID,
  updated_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, serial_no)
);
CREATE INDEX IF NOT EXISTS idx_erp_product_serials_product ON erp_product_serials(product_id);
CREATE INDEX IF NOT EXISTS idx_erp_product_serials_status ON erp_product_serials(status);
CREATE INDEX IF NOT EXISTS idx_erp_product_serials_warehouse ON erp_product_serials(warehouse_id);

-- ─── 3. Warranties (generated end_date; status derived on read) ────────────────
CREATE TABLE IF NOT EXISTS erp_warranties (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  product_serial_id UUID REFERENCES erp_product_serials(id) ON DELETE CASCADE,
  product_id        UUID REFERENCES erp_products_catalog(id) ON DELETE SET NULL,
  invoice_id        UUID REFERENCES erp_invoices(id) ON DELETE SET NULL,
  customer_id       UUID REFERENCES erp_customers(id) ON DELETE SET NULL,
  start_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  period_months     INTEGER NOT NULL DEFAULT 12,
  end_date          DATE GENERATED ALWAYS AS ((start_date + make_interval(months => period_months))::date) STORED,
  terms             TEXT,
  is_void           BOOLEAN NOT NULL DEFAULT false,
  external_id       TEXT,
  created_by        UUID,
  updated_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_warranties_serial ON erp_warranties(product_serial_id);
CREATE INDEX IF NOT EXISTS idx_erp_warranties_invoice ON erp_warranties(invoice_id);
CREATE INDEX IF NOT EXISTS idx_erp_warranties_customer ON erp_warranties(customer_id);

-- ─── 4. RMA (orchestrates existing returns) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_rma (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  branch_id           UUID NOT NULL REFERENCES erp_branches(id) ON DELETE RESTRICT,
  rma_number          TEXT NOT NULL UNIQUE,
  customer_id         UUID REFERENCES erp_customers(id) ON DELETE SET NULL,
  supplier_id         UUID REFERENCES erp_suppliers(id) ON DELETE SET NULL,
  product_serial_id   UUID REFERENCES erp_product_serials(id) ON DELETE SET NULL,
  product_id          UUID REFERENCES erp_products_catalog(id) ON DELETE SET NULL,
  invoice_ref         UUID REFERENCES erp_invoices(id) ON DELETE SET NULL,
  reason              TEXT,
  fault_description   TEXT,
  status              erp_rma_status NOT NULL DEFAULT 'requested',
  resolution          TEXT,
  sales_return_id     UUID REFERENCES erp_sales_returns(id) ON DELETE SET NULL,
  purchase_return_id  UUID REFERENCES erp_purchase_returns(id) ON DELETE SET NULL,
  approved_by         UUID,
  external_id         TEXT,
  created_by          UUID,
  updated_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_rma_branch ON erp_rma(branch_id);
CREATE INDEX IF NOT EXISTS idx_erp_rma_status ON erp_rma(status);
CREATE INDEX IF NOT EXISTS idx_erp_rma_customer ON erp_rma(customer_id);
CREATE INDEX IF NOT EXISTS idx_erp_rma_serial ON erp_rma(product_serial_id);

-- ─── company_id triggers + updated_at + RLS ────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['erp_product_serials','erp_warranties','erp_rma'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_company ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_set_company BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()', t, t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at()', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%I_tenant" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%I_tenant" ON %I FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id()) WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id())', t, t);
  END LOOP;
END $$;

-- ─── 5. Extend erp_complete_transfer IN PLACE (serialized warehouse relocation) ─
-- Re-create with the original behaviour PLUS a guarded serial relocation: for
-- serialized products on the transfer, move the in-stock serials in the
-- transferred warehouse to the destination. Non-serialized lines are unaffected.
CREATE OR REPLACE FUNCTION erp_complete_transfer(p_transfer_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order erp_transfer_orders;
  v_uid UUID := auth.uid();
  v_branch UUID;
BEGIN
  SELECT * INTO v_order FROM erp_transfer_orders WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'أمر التحويل غير موجود'; END IF;
  SELECT branch_id INTO v_branch FROM erp_warehouses WHERE id = v_order.from_warehouse_id;
  IF NOT erp_has_branch_access(v_branch) THEN RAISE EXCEPTION 'غير مصرح بالوصول لهذا الفرع'; END IF;
  IF v_order.status = 'received' THEN RAISE EXCEPTION 'تم تنفيذ هذا التحويل بالفعل'; END IF;
  IF v_order.status = 'cancelled' THEN RAISE EXCEPTION 'أمر التحويل ملغي'; END IF;
  IF NOT EXISTS (SELECT 1 FROM erp_transfer_order_lines WHERE transfer_order_id = p_transfer_id) THEN
    RAISE EXCEPTION 'أمر التحويل بلا بنود';
  END IF;

  INSERT INTO erp_stock_movements (movement_type, warehouse_id, product_id, quantity, reference_type, reference_id, notes, created_by)
  SELECT 'transfer_out', v_order.from_warehouse_id, l.product_id, -abs(l.quantity), 'transfer', p_transfer_id, 'تحويل صادر: ' || v_order.transfer_number, v_uid
  FROM erp_transfer_order_lines l WHERE l.transfer_order_id = p_transfer_id;

  INSERT INTO erp_stock_movements (movement_type, warehouse_id, product_id, quantity, reference_type, reference_id, notes, created_by)
  SELECT 'transfer_in', v_order.to_warehouse_id, l.product_id, abs(l.quantity), 'transfer', p_transfer_id, 'تحويل وارد: ' || v_order.transfer_number, v_uid
  FROM erp_transfer_order_lines l WHERE l.transfer_order_id = p_transfer_id;

  -- Serialized relocation (additive; only touches serialized products in transit).
  UPDATE erp_product_serials s
  SET warehouse_id = v_order.to_warehouse_id, updated_by = v_uid
  WHERE s.warehouse_id = v_order.from_warehouse_id
    AND s.status = 'in_stock'
    AND s.product_id IN (
      SELECT l.product_id FROM erp_transfer_order_lines l
      JOIN erp_products_catalog p ON p.id = l.product_id
      WHERE l.transfer_order_id = p_transfer_id AND p.is_serialized = true
    );

  UPDATE erp_transfer_order_lines SET received_qty = quantity WHERE transfer_order_id = p_transfer_id;
  UPDATE erp_transfer_orders SET status = 'received' WHERE id = p_transfer_id;
END;
$$;

-- ─── 6. RMA status orchestration RPC ───────────────────────────────────────────
-- Advances the RMA status and drives the linked serial's status. Resolution that
-- requires stock/accounting DELEGATES to the existing return RPCs (caller links
-- sales_return_id / purchase_return_id first); this RPC never re-implements the
-- accounting. SECURITY DEFINER + pinned search_path; anon/public revoked.
CREATE OR REPLACE FUNCTION erp_rma_set_status(p_rma_id UUID, p_status erp_rma_status, p_resolution TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rma erp_rma;
  v_uid UUID := auth.uid();
BEGIN
  SELECT * INTO v_rma FROM erp_rma WHERE id = p_rma_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'طلب الإرجاع غير موجود'; END IF;
  IF NOT erp_has_branch_access(v_rma.branch_id) THEN RAISE EXCEPTION 'غير مصرح بالوصول لهذا الفرع'; END IF;

  UPDATE erp_rma
  SET status = p_status,
      resolution = COALESCE(p_resolution, resolution),
      approved_by = CASE WHEN p_status IN ('approved','closed','rejected') THEN v_uid ELSE approved_by END,
      updated_by = v_uid
  WHERE id = p_rma_id;

  -- Drive the linked serial's lifecycle to match the resolution.
  IF v_rma.product_serial_id IS NOT NULL THEN
    UPDATE erp_product_serials
    SET status = CASE
        WHEN p_status IN ('refund','replace') THEN 'returned'::erp_serial_status
        WHEN p_status = 'rejected' THEN 'sold'::erp_serial_status
        WHEN p_status IN ('requested','approved','received','repair') THEN 'rma'::erp_serial_status
        WHEN p_status = 'closed' THEN status  -- terminal; leave as set by the resolution step
        ELSE status END,
        updated_by = v_uid
    WHERE id = v_rma.product_serial_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION erp_rma_set_status(UUID, erp_rma_status, TEXT) FROM anon, public;

-- ─── 7. Permission electrical.rma (+ backfill to electronics roles) ────────────
INSERT INTO erp_role_permissions (role_key, permission) VALUES
  ('admin','electrical.rma'),('manager','electrical.rma'),('technician','electrical.rma')
ON CONFLICT DO NOTHING;

INSERT INTO erp_company_role_permissions (company_id, role_key, permission)
SELECT cr.company_id, cr.role_key, 'electrical.rma'
FROM erp_company_roles cr JOIN erp_companies c ON c.id = cr.company_id
WHERE c.business_type = 'electronics' AND cr.enabled AND cr.role_key IN ('admin','manager','technician')
ON CONFLICT DO NOTHING;
