-- ============================================================================
-- 0229: Route Accounting & Van Operations (Phase 7A)
-- ----------------------------------------------------------------------------
-- The operational foundation of van/route distribution. Net-new tables for the
-- pieces not already modelled: van opening balance, company-configurable expense
-- categories (+seed) + expenses, cash reconciliation, and the van day-settlement
-- statement (route P&L snapshot). REUSES van load manifest (0194), van transfers
-- (0133), van reconciliation (0138, inventory variance), day-close (0132),
-- collections (0192), returns (0219). Additive + INERT until KAKO_VAN_ACCOUNTING
-- is on. Company-scoped RLS. Depends on 0005, 0018, 0128.
-- ============================================================================

-- Van opening balance (cash + stock value at day start).
CREATE TABLE IF NOT EXISTS erp_van_opening_balances (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  branch_id           uuid REFERENCES erp_branches(id) ON DELETE SET NULL,
  warehouse_id        uuid REFERENCES erp_warehouses(id) ON DELETE CASCADE,   -- the van
  salesman_id         uuid,
  balance_date        date NOT NULL DEFAULT CURRENT_DATE,
  opening_cash        numeric(14,2) NOT NULL DEFAULT 0,
  opening_stock_value numeric(14,2) NOT NULL DEFAULT 0,
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, balance_date)
);
CREATE INDEX IF NOT EXISTS idx_van_opening_company   ON erp_van_opening_balances (company_id, balance_date);
CREATE INDEX IF NOT EXISTS idx_van_opening_branch    ON erp_van_opening_balances (branch_id);
ALTER TABLE erp_van_opening_balances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_van_opening_tenant ON erp_van_opening_balances;
CREATE POLICY erp_van_opening_tenant ON erp_van_opening_balances FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Company-configurable expense categories (company_id NULL = platform default).
CREATE TABLE IF NOT EXISTS erp_van_expense_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES erp_companies(id) ON DELETE CASCADE,
  code       text NOT NULL,
  label      text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_van_expense_cat_company ON erp_van_expense_categories (company_id, code) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_van_expense_cat_global  ON erp_van_expense_categories (code) WHERE company_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_van_expense_cat_company ON erp_van_expense_categories (company_id, is_active);
ALTER TABLE erp_van_expense_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_van_expense_cat_tenant ON erp_van_expense_categories;
CREATE POLICY erp_van_expense_cat_tenant ON erp_van_expense_categories FOR ALL
  USING (company_id IS NULL OR erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

INSERT INTO erp_van_expense_categories (company_id, code, label)
SELECT NULL, v.code, v.label
FROM (VALUES ('fuel','Fuel'),('per_diem','Per Diem'),('maintenance','Maintenance'),
             ('parking','Parking'),('tolls','Tolls'),('misc','Miscellaneous')) AS v(code, label)
WHERE NOT EXISTS (SELECT 1 FROM erp_van_expense_categories c WHERE c.company_id IS NULL AND c.code = v.code);

-- Route/van expenses.
CREATE TABLE IF NOT EXISTS erp_van_expenses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  branch_id    uuid REFERENCES erp_branches(id) ON DELETE SET NULL,
  warehouse_id uuid REFERENCES erp_warehouses(id) ON DELETE SET NULL,
  salesman_id  uuid,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  category_id  uuid REFERENCES erp_van_expense_categories(id) ON DELETE SET NULL,
  amount       numeric(14,2) NOT NULL DEFAULT 0,
  notes        text,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_van_expenses_company   ON erp_van_expenses (company_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_van_expenses_branch    ON erp_van_expenses (branch_id);
CREATE INDEX IF NOT EXISTS idx_van_expenses_warehouse ON erp_van_expenses (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_van_expenses_category  ON erp_van_expenses (category_id);
ALTER TABLE erp_van_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_van_expenses_tenant ON erp_van_expenses;
CREATE POLICY erp_van_expenses_tenant ON erp_van_expenses FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Cash reconciliation (expected vs counted → variance).
CREATE TABLE IF NOT EXISTS erp_van_cash_reconciliations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  branch_id        uuid REFERENCES erp_branches(id) ON DELETE SET NULL,
  warehouse_id     uuid REFERENCES erp_warehouses(id) ON DELETE SET NULL,
  salesman_id      uuid,
  recon_date       date NOT NULL DEFAULT CURRENT_DATE,
  opening_cash     numeric(14,2) NOT NULL DEFAULT 0,
  cash_sales       numeric(14,2) NOT NULL DEFAULT 0,
  cash_collections numeric(14,2) NOT NULL DEFAULT 0,
  cash_returns     numeric(14,2) NOT NULL DEFAULT 0,
  expenses_total   numeric(14,2) NOT NULL DEFAULT 0,
  expected_cash    numeric(14,2) NOT NULL DEFAULT 0,
  counted_cash     numeric(14,2) NOT NULL DEFAULT 0,
  variance         numeric(14,2) NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','settled','rejected')),
  settled_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, recon_date)
);
CREATE INDEX IF NOT EXISTS idx_van_cash_recon_company ON erp_van_cash_reconciliations (company_id, recon_date);
CREATE INDEX IF NOT EXISTS idx_van_cash_recon_branch  ON erp_van_cash_reconciliations (branch_id);
ALTER TABLE erp_van_cash_reconciliations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_van_cash_recon_tenant ON erp_van_cash_reconciliations;
CREATE POLICY erp_van_cash_recon_tenant ON erp_van_cash_reconciliations FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- Van day settlement (statement header + route P&L snapshot).
CREATE TABLE IF NOT EXISTS erp_van_day_settlements (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  branch_id                uuid REFERENCES erp_branches(id) ON DELETE SET NULL,
  warehouse_id             uuid REFERENCES erp_warehouses(id) ON DELETE SET NULL,
  salesman_id              uuid,
  settlement_date          date NOT NULL DEFAULT CURRENT_DATE,
  status                   text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','settled','rejected')),
  cash_variance            numeric(14,2) NOT NULL DEFAULT 0,
  inventory_variance_value numeric(14,2) NOT NULL DEFAULT 0,
  route_revenue            numeric(16,2) NOT NULL DEFAULT 0,
  route_gross_profit       numeric(16,2) NOT NULL DEFAULT 0,
  route_net_profit         numeric(16,2) NOT NULL DEFAULT 0,
  statement                jsonb NOT NULL DEFAULT '{}'::jsonb,
  settled_by               uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, settlement_date)
);
CREATE INDEX IF NOT EXISTS idx_van_settlements_company ON erp_van_day_settlements (company_id, settlement_date);
CREATE INDEX IF NOT EXISTS idx_van_settlements_branch  ON erp_van_day_settlements (branch_id);
ALTER TABLE erp_van_day_settlements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_van_settlements_tenant ON erp_van_day_settlements;
CREATE POLICY erp_van_settlements_tenant ON erp_van_day_settlements FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
