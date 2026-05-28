-- ============================================================================
-- 0018: Multi-tenant foundation (Phase 1)
-- ----------------------------------------------------------------------------
-- Turns the app into a multi-company SaaS by isolating the shared master data
-- (products, categories, suppliers, price lists) per company (tenant), adds a
-- platform-owner concept (the vendor) that sees across tenants, and helpers to
-- resolve the current user's company. Operational data (sales, inventory,
-- accounting) is already isolated via branch membership. Safe to re-run.
-- ============================================================================

-- ─── Platform owner (the vendor) ──────────────────────────────────────────
ALTER TABLE erp_profiles ADD COLUMN IF NOT EXISTS is_platform_owner BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION erp_is_platform_owner()
RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT is_platform_owner FROM erp_profiles WHERE id = auth.uid()), false);
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- The company (tenant) the current user belongs to (their default branch's company).
CREATE OR REPLACE FUNCTION erp_user_company_id()
RETURNS UUID AS $$
  SELECT b.company_id
  FROM erp_user_branches ub
  JOIN erp_branches b ON b.id = ub.branch_id
  WHERE ub.user_id = auth.uid()
  ORDER BY ub.is_default DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Auto-fill company_id from the current user's company on insert.
CREATE OR REPLACE FUNCTION erp_set_company_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := erp_user_company_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── Add company_id + isolate the shared master-data tables ─────────────────
DO $$
DECLARE
  v_default_company UUID;
  t TEXT;
BEGIN
  SELECT id INTO v_default_company FROM erp_companies ORDER BY created_at LIMIT 1;

  FOREACH t IN ARRAY ARRAY['erp_products_catalog','erp_product_categories','erp_suppliers','erp_price_lists']
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES erp_companies(id) ON DELETE CASCADE', t);
    -- backfill existing rows to the first (demo) company
    IF v_default_company IS NOT NULL THEN
      EXECUTE format('UPDATE %I SET company_id = %L WHERE company_id IS NULL', t, v_default_company);
    END IF;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(company_id)', 'idx_' || t || '_company', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_set_company', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()', t || '_set_company', t);
  END LOOP;
END $$;

-- ─── Replace the global RLS with tenant-scoped policies ─────────────────────
-- Products catalog
DROP POLICY IF EXISTS "erp_products_catalog_select" ON erp_products_catalog;
DROP POLICY IF EXISTS "erp_products_catalog_manage" ON erp_products_catalog;
DROP POLICY IF EXISTS "erp_products_catalog_tenant" ON erp_products_catalog;
CREATE POLICY "erp_products_catalog_tenant" ON erp_products_catalog FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Product categories
DROP POLICY IF EXISTS "erp_product_categories_select" ON erp_product_categories;
DROP POLICY IF EXISTS "erp_product_categories_manage" ON erp_product_categories;
DROP POLICY IF EXISTS "erp_product_categories_tenant" ON erp_product_categories;
CREATE POLICY "erp_product_categories_tenant" ON erp_product_categories FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Suppliers
DROP POLICY IF EXISTS "erp_suppliers_select" ON erp_suppliers;
DROP POLICY IF EXISTS "erp_suppliers_manage" ON erp_suppliers;
DROP POLICY IF EXISTS "erp_suppliers_tenant" ON erp_suppliers;
CREATE POLICY "erp_suppliers_tenant" ON erp_suppliers FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Price lists
DROP POLICY IF EXISTS "erp_price_lists_select" ON erp_price_lists;
DROP POLICY IF EXISTS "erp_price_lists_manage" ON erp_price_lists;
DROP POLICY IF EXISTS "erp_price_lists_tenant" ON erp_price_lists;
CREATE POLICY "erp_price_lists_tenant" ON erp_price_lists FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- ─── Companies & branches: platform owner can manage all ────────────────────
DROP POLICY IF EXISTS "erp_companies_platform" ON erp_companies;
CREATE POLICY "erp_companies_platform" ON erp_companies FOR ALL
  USING (erp_is_platform_owner()) WITH CHECK (erp_is_platform_owner());
DROP POLICY IF EXISTS "erp_branches_platform" ON erp_branches;
CREATE POLICY "erp_branches_platform" ON erp_branches FOR ALL
  USING (erp_is_platform_owner()) WITH CHECK (erp_is_platform_owner());
