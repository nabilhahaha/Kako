-- ============================================================================
-- 0190: Purchasing Foundation — supplier invoices (bills) + 3-way match linkage
-- ----------------------------------------------------------------------------
-- The supplier-invoice (bill) model that the 3-way match engine (Phase 2 inc.1)
-- and the AP sub-ledger consume. A bill line links back to its PO line and GR
-- line so the engine can compare ordered / received / billed. Additive + INERT:
-- nothing writes these until KAKO_PURCHASING is on; no posting, no behaviour
-- change. Branch-scoped RLS mirroring erp_purchase_orders.
--
--   * erp_supplier_invoices       — bill header + status/match lifecycle + due date
--   * erp_supplier_invoice_lines  — bill lines, linked to po_line / gr_line
--   * erp_suppliers.payment_terms_days — additive nullable (drives due-date calc)
--
-- Duplicate-bill guard: UNIQUE(supplier_id, invoice_number) (data-integrity).
-- Depends on 0005 (erp_suppliers/_purchase_orders/_purchase_order_lines/
-- _goods_receipt_lines/_branches/_products_catalog, erp_user_branch_ids()).
-- ============================================================================

-- ── Supplier payment terms (additive) ───────────────────────────────────────
ALTER TABLE erp_suppliers ADD COLUMN IF NOT EXISTS payment_terms_days integer;

-- ── Bill header ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_supplier_invoices (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id          uuid NOT NULL REFERENCES erp_branches(id) ON DELETE RESTRICT,
  supplier_id        uuid NOT NULL REFERENCES erp_suppliers(id) ON DELETE RESTRICT,
  purchase_order_id  uuid REFERENCES erp_purchase_orders(id) ON DELETE SET NULL,
  invoice_number     text NOT NULL,                 -- supplier's bill number
  invoice_date       date NOT NULL DEFAULT CURRENT_DATE,
  due_date           date,
  status             text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','matched','on_hold','approved','posted','paid','cancelled')),
  match_status       text NOT NULL DEFAULT 'unmatched'
                       CHECK (match_status IN ('unmatched','matched','variance')),
  net_amount         numeric(14,2) NOT NULL DEFAULT 0,
  tax_amount         numeric(14,2) NOT NULL DEFAULT 0,
  total_amount       numeric(14,2) NOT NULL DEFAULT 0,
  notes              text,
  created_by         uuid,
  approved_by        uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, invoice_number)              -- duplicate-bill guard
);
-- FK-covering indexes (schema-health: first index col = FK col). supplier_id is
-- covered by the UNIQUE(supplier_id, invoice_number) above.
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_branch ON erp_supplier_invoices (branch_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_po     ON erp_supplier_invoices (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_status ON erp_supplier_invoices (branch_id, status);

-- ── Bill lines (linked to PO line + GR line for matching) ───────────────────
CREATE TABLE IF NOT EXISTS erp_supplier_invoice_lines (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_invoice_id uuid NOT NULL REFERENCES erp_supplier_invoices(id) ON DELETE CASCADE,
  product_id          uuid NOT NULL REFERENCES erp_products_catalog(id) ON DELETE RESTRICT,
  po_line_id          uuid REFERENCES erp_purchase_order_lines(id) ON DELETE SET NULL,
  gr_line_id          uuid REFERENCES erp_goods_receipt_lines(id) ON DELETE SET NULL,
  quantity            numeric(14,3) NOT NULL,
  unit_price          numeric(14,4) NOT NULL,
  line_total          numeric(14,2) NOT NULL DEFAULT 0,
  match_status        text NOT NULL DEFAULT 'unmatched'
                        CHECK (match_status IN ('unmatched','matched','variance')),
  match_flags         jsonb NOT NULL DEFAULT '[]'::jsonb,   -- engine flags (over_billed, price_variance, …)
  created_at          timestamptz NOT NULL DEFAULT now()
);
-- FK-covering indexes for every FK first-column.
CREATE INDEX IF NOT EXISTS idx_supplier_invoice_lines_invoice ON erp_supplier_invoice_lines (supplier_invoice_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoice_lines_product ON erp_supplier_invoice_lines (product_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoice_lines_po_line ON erp_supplier_invoice_lines (po_line_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoice_lines_gr_line ON erp_supplier_invoice_lines (gr_line_id);

-- ── RLS: branch-scoped, mirroring erp_purchase_orders ───────────────────────
ALTER TABLE erp_supplier_invoices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_supplier_invoice_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_supplier_invoices_select ON erp_supplier_invoices;
CREATE POLICY erp_supplier_invoices_select ON erp_supplier_invoices FOR SELECT
  USING (branch_id = ANY(erp_user_branch_ids()));
DROP POLICY IF EXISTS erp_supplier_invoices_manage ON erp_supplier_invoices;
CREATE POLICY erp_supplier_invoices_manage ON erp_supplier_invoices FOR ALL
  USING (branch_id = ANY(erp_user_branch_ids()))
  WITH CHECK (branch_id = ANY(erp_user_branch_ids()));

DROP POLICY IF EXISTS erp_supplier_invoice_lines_select ON erp_supplier_invoice_lines;
CREATE POLICY erp_supplier_invoice_lines_select ON erp_supplier_invoice_lines FOR SELECT
  USING (supplier_invoice_id IN (SELECT id FROM erp_supplier_invoices WHERE branch_id = ANY(erp_user_branch_ids())));
DROP POLICY IF EXISTS erp_supplier_invoice_lines_manage ON erp_supplier_invoice_lines;
CREATE POLICY erp_supplier_invoice_lines_manage ON erp_supplier_invoice_lines FOR ALL
  USING (supplier_invoice_id IN (SELECT id FROM erp_supplier_invoices WHERE branch_id = ANY(erp_user_branch_ids())))
  WITH CHECK (supplier_invoice_id IN (SELECT id FROM erp_supplier_invoices WHERE branch_id = ANY(erp_user_branch_ids())));
