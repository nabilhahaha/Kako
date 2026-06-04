-- ============================================================================
-- 0096: Electrical Retail & Wholesale Pack — Sub-slice A
--       (multi-tier pricing seed + supplier/purchase returns)
-- ----------------------------------------------------------------------------
-- ADDITIVE + idempotent. Extends the EXISTING wholesale-tier pricing and mirrors
-- the EXISTING sales-return flow for the supplier (purchase) side. No deletions,
-- no change to any existing row's meaning, protected verticals untouched.
--
-- Part 1 — Multi-tier pricing: seed the four electrical tiers
--   (retail / semi_wholesale / wholesale / project) into erp_wholesale_tiers for
--   companies of business_type 'electronics' (surfaced as the Electrical pack);
--   prices live in the existing erp_wholesale_prices (tier x product); customer
--   default tier via erp_wholesale_customer_tier. "Project" is a tier; per-line
--   manual price override already exists on order/invoice lines. Ensures the
--   'wholesale' module is enabled for electronics so the tier screens show.
--
-- Part 2 — Supplier (purchase) returns: erp_purchase_returns(+_lines) mirroring
--   erp_sales_returns, with erp_complete_purchase_return RPC emitting the
--   existing 'return_out' stock movement (already in the enum), a contra-purchase
--   journal (inventory credit / AP debit), and a supplier-balance reduction.
--   New permission purchasing.return.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1 — Electrical multi-tier pricing (reuse erp_wholesale_*)
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable the wholesale (tier-pricing) module for electronics companies so the
-- existing tier screens are available (additive; preselect only — fully editable).
INSERT INTO erp_business_type_modules (business_type, module) VALUES ('electronics','wholesale')
ON CONFLICT (business_type, module) DO NOTHING;

INSERT INTO erp_company_modules (company_id, module, enabled)
SELECT id, 'wholesale', true FROM erp_companies WHERE business_type = 'electronics'
ON CONFLICT (company_id, module) DO NOTHING;

INSERT INTO erp_company_role_permissions (company_id, role_key, permission)
SELECT cr.company_id, cr.role_key, 'wholesale.pricing'
FROM erp_company_roles cr JOIN erp_companies c ON c.id = cr.company_id
WHERE c.business_type = 'electronics' AND cr.enabled AND cr.role_key IN ('admin','manager')
ON CONFLICT DO NOTHING;

-- Seed the four named tiers per electronics company (idempotent on (company_id,name)).
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT id FROM erp_companies WHERE business_type = 'electronics' LOOP
    INSERT INTO erp_wholesale_tiers (company_id, name, sort, is_active)
    SELECT c.id, v.name, v.sort, true
    FROM (VALUES ('retail',0),('semi_wholesale',1),('wholesale',2),('project',3)) AS v(name, sort)
    WHERE NOT EXISTS (
      SELECT 1 FROM erp_wholesale_tiers t WHERE t.company_id = c.id AND t.name = v.name
    );
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 2 — Supplier (purchase) returns — mirror of sales returns
-- ─────────────────────────────────────────────────────────────────────────────

-- Header (mirrors erp_sales_returns; branch-scoped like the rest of procurement).
CREATE TABLE IF NOT EXISTS erp_purchase_returns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id       UUID NOT NULL REFERENCES erp_branches(id) ON DELETE RESTRICT,
  supplier_id     UUID NOT NULL REFERENCES erp_suppliers(id) ON DELETE RESTRICT,
  purchase_order_id UUID REFERENCES erp_purchase_orders(id) ON DELETE SET NULL,
  return_number   TEXT NOT NULL UNIQUE,
  status          erp_return_status NOT NULL DEFAULT 'draft',
  total_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  reason          TEXT,
  notes           TEXT,
  external_id     TEXT,
  approved_by     UUID,
  created_by      UUID,
  updated_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_purchase_return_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id     UUID NOT NULL REFERENCES erp_purchase_returns(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES erp_products_catalog(id) ON DELETE RESTRICT,
  quantity      NUMERIC(14,3) NOT NULL,
  unit_price    NUMERIC(14,2) NOT NULL,
  line_total    NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_purchase_returns_branch ON erp_purchase_returns(branch_id);
CREATE INDEX IF NOT EXISTS idx_erp_purchase_returns_supplier ON erp_purchase_returns(supplier_id);
CREATE INDEX IF NOT EXISTS idx_erp_purchase_returns_status ON erp_purchase_returns(status);
CREATE INDEX IF NOT EXISTS idx_erp_purchase_return_lines_return ON erp_purchase_return_lines(return_id);
CREATE INDEX IF NOT EXISTS idx_erp_purchase_return_lines_product ON erp_purchase_return_lines(product_id);

DROP TRIGGER IF EXISTS erp_purchase_returns_updated ON erp_purchase_returns;
CREATE TRIGGER erp_purchase_returns_updated
  BEFORE UPDATE ON erp_purchase_returns
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

-- RLS: branch-scoped, mirroring the sales-return policies.
ALTER TABLE erp_purchase_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_purchase_return_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "erp_purchase_returns_select" ON erp_purchase_returns;
CREATE POLICY "erp_purchase_returns_select" ON erp_purchase_returns FOR SELECT
  USING (branch_id = ANY(erp_user_branch_ids()));
DROP POLICY IF EXISTS "erp_purchase_returns_manage" ON erp_purchase_returns;
CREATE POLICY "erp_purchase_returns_manage" ON erp_purchase_returns FOR ALL
  USING (branch_id = ANY(erp_user_branch_ids()));

DROP POLICY IF EXISTS "erp_purchase_return_lines_select" ON erp_purchase_return_lines;
CREATE POLICY "erp_purchase_return_lines_select" ON erp_purchase_return_lines FOR SELECT
  USING (return_id IN (SELECT pr.id FROM erp_purchase_returns pr WHERE pr.branch_id = ANY(erp_user_branch_ids())));
DROP POLICY IF EXISTS "erp_purchase_return_lines_manage" ON erp_purchase_return_lines;
CREATE POLICY "erp_purchase_return_lines_manage" ON erp_purchase_return_lines FOR ALL
  USING (return_id IN (SELECT pr.id FROM erp_purchase_returns pr WHERE pr.branch_id = ANY(erp_user_branch_ids())));

-- ─── Complete a purchase return (destock + contra-purchase journal + balance) ──
-- Mirror of erp_complete_sales_return: stock leaves to the supplier (return_out),
-- inventory is credited / AP is debited, and the supplier balance is reduced.
CREATE OR REPLACE FUNCTION erp_complete_purchase_return(p_return_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ret erp_purchase_returns;
  v_uid UUID := auth.uid();
  v_wh UUID;
  v_inv_acc UUID;
  v_ap_acc UUID;
  v_entry_id UUID;
BEGIN
  SELECT * INTO v_ret FROM erp_purchase_returns WHERE id = p_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'مرتجع المشتريات غير موجود'; END IF;
  IF NOT erp_has_branch_access(v_ret.branch_id) THEN RAISE EXCEPTION 'غير مصرح بالوصول لهذا الفرع'; END IF;
  IF v_ret.status = 'completed' THEN RAISE EXCEPTION 'تم اعتماد هذا المرتجع بالفعل'; END IF;
  IF v_ret.status = 'cancelled' THEN RAISE EXCEPTION 'المرتجع ملغي'; END IF;
  IF NOT EXISTS (SELECT 1 FROM erp_purchase_return_lines WHERE return_id = p_return_id) THEN
    RAISE EXCEPTION 'المرتجع بلا بنود';
  END IF;

  -- Stock leaves the branch's primary warehouse back to the supplier.
  SELECT id INTO v_wh FROM erp_warehouses
    WHERE branch_id = v_ret.branch_id AND is_active = true ORDER BY code LIMIT 1;
  IF v_wh IS NOT NULL THEN
    INSERT INTO erp_stock_movements (movement_type, warehouse_id, product_id, quantity, reference_type, reference_id, notes, created_by)
    SELECT 'return_out', v_wh, l.product_id, -abs(l.quantity), 'purchase_return', p_return_id, 'مرتجع مشتريات: ' || v_ret.return_number, v_uid
    FROM erp_purchase_return_lines l WHERE l.return_id = p_return_id;
  END IF;

  -- Contra-purchase journal: credit inventory (1300), debit AP (2100).
  IF v_ret.total_amount > 0 THEN
    SELECT id INTO v_inv_acc FROM erp_chart_of_accounts WHERE code = '1300' AND is_system = true;
    SELECT id INTO v_ap_acc FROM erp_chart_of_accounts WHERE code = '2100' AND is_system = true;
    IF v_inv_acc IS NOT NULL AND v_ap_acc IS NOT NULL THEN
      INSERT INTO erp_journal_entries (entry_number, description, reference_type, reference_id, branch_id, status, created_by, posted_by, posted_at)
      VALUES (erp_next_number(v_ret.branch_id, 'preturn'), 'مرتجع مشتريات ' || v_ret.return_number,
              'purchase_return', p_return_id, v_ret.branch_id, 'posted', v_uid, v_uid, now())
      RETURNING id INTO v_entry_id;
      INSERT INTO erp_journal_lines (journal_entry_id, account_id, debit, credit, description) VALUES
        (v_entry_id, v_ap_acc, v_ret.total_amount, 0, 'موردون - مرتجع ' || v_ret.return_number),
        (v_entry_id, v_inv_acc, 0, v_ret.total_amount, 'مخزون - مرتجع ' || v_ret.return_number);
    END IF;
  END IF;

  -- Returning goods reduces what we owe the supplier.
  UPDATE erp_suppliers SET balance = balance - v_ret.total_amount WHERE id = v_ret.supplier_id;
  UPDATE erp_purchase_returns SET status = 'completed', approved_by = v_uid WHERE id = p_return_id;
END;
$$;

REVOKE ALL ON FUNCTION erp_complete_purchase_return(UUID) FROM anon, public;

-- New permission for supplier returns, granted to admin/manager globally and
-- backfilled to existing electronics companies' admin/manager roles.
INSERT INTO erp_role_permissions (role_key, permission) VALUES
  ('admin','purchasing.return'),('manager','purchasing.return')
ON CONFLICT DO NOTHING;

INSERT INTO erp_company_role_permissions (company_id, role_key, permission)
SELECT cr.company_id, cr.role_key, 'purchasing.return'
FROM erp_company_roles cr JOIN erp_companies c ON c.id = cr.company_id
WHERE c.business_type = 'electronics' AND cr.enabled AND cr.role_key IN ('admin','manager')
ON CONFLICT DO NOTHING;
