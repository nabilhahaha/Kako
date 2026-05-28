-- ============================================================================
-- 0019: Isolate customers per company + per-company unique codes
-- ----------------------------------------------------------------------------
-- Adds company_id to customers (tenant isolation) and changes the globally
-- unique master-data codes to be unique per company, so different companies
-- can reuse the same codes. Safe to re-run.
-- ============================================================================

-- ─── Customers: company_id + isolate ────────────────────────────────────────
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES erp_companies(id) ON DELETE CASCADE;

DO $$
DECLARE v_default UUID;
BEGIN
  -- from the customer's branch first
  UPDATE erp_customers c SET company_id = b.company_id
  FROM erp_branches b WHERE c.branch_id = b.id AND c.company_id IS NULL;
  -- fallback: the first company
  SELECT id INTO v_default FROM erp_companies ORDER BY created_at LIMIT 1;
  IF v_default IS NOT NULL THEN
    UPDATE erp_customers SET company_id = v_default WHERE company_id IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_erp_customers_company ON erp_customers(company_id);
DROP TRIGGER IF EXISTS erp_customers_set_company ON erp_customers;
CREATE TRIGGER erp_customers_set_company BEFORE INSERT ON erp_customers
  FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();

DROP POLICY IF EXISTS "erp_customers_select" ON erp_customers;
DROP POLICY IF EXISTS "erp_customers_manage" ON erp_customers;
DROP POLICY IF EXISTS "erp_customers_tenant" ON erp_customers;
CREATE POLICY "erp_customers_tenant" ON erp_customers FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- ─── Per-company unique codes (was globally unique) ─────────────────────────
ALTER TABLE erp_products_catalog DROP CONSTRAINT IF EXISTS erp_products_catalog_code_key;
ALTER TABLE erp_product_categories DROP CONSTRAINT IF EXISTS erp_product_categories_code_key;
ALTER TABLE erp_suppliers DROP CONSTRAINT IF EXISTS erp_suppliers_code_key;
ALTER TABLE erp_customers DROP CONSTRAINT IF EXISTS erp_customers_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_erp_products_catalog_company_code ON erp_products_catalog(company_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_erp_product_categories_company_code ON erp_product_categories(company_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_erp_suppliers_company_code ON erp_suppliers(company_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_erp_customers_company_code ON erp_customers(company_id, code);
