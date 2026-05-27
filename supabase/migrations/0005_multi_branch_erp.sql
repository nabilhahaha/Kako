-- ============================================================================
-- Multi-Branch ERP System — Complete Schema
-- Migration 0005
-- ============================================================================
-- Covers: Company/Branch structure, Inventory/Warehouse, Sales, Procurement,
-- Accounting, Auto-numbering, Triggers, RLS policies, Indexes, Seed data.
-- All statements are idempotent (safe to re-run).
-- ============================================================================

-- ============================================================================
-- 0. EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. CUSTOM ENUM TYPES
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE erp_stock_movement_type AS ENUM (
    'purchase_in', 'sale_out', 'transfer_out', 'transfer_in',
    'adjustment', 'return_in', 'return_out', 'opening_balance'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE erp_transfer_status AS ENUM (
    'draft', 'in_transit', 'received', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE erp_sales_order_status AS ENUM (
    'draft', 'confirmed', 'invoiced', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE erp_invoice_status AS ENUM (
    'draft', 'issued', 'paid', 'partially_paid', 'cancelled', 'overdue'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE erp_payment_method AS ENUM (
    'cash', 'bank_transfer', 'check', 'credit_card', 'mobile_payment'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE erp_return_status AS ENUM (
    'draft', 'approved', 'completed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE erp_po_status AS ENUM (
    'draft', 'sent', 'partial', 'received', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE erp_account_type AS ENUM (
    'asset', 'liability', 'equity', 'revenue', 'expense'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE erp_fiscal_period_status AS ENUM (
    'open', 'closed', 'locked'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE erp_journal_status AS ENUM (
    'draft', 'posted', 'reversed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE erp_voucher_status AS ENUM (
    'draft', 'approved', 'posted', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 2. HELPER FUNCTION: updated_at trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION erp_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. COMPANY & BRANCH STRUCTURE
-- ============================================================================

-- 3a. Companies
CREATE TABLE IF NOT EXISTS erp_companies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  name_ar     TEXT,
  tax_number  TEXT,
  cr_number   TEXT,           -- commercial registration
  logo_url    TEXT,
  address     TEXT,
  phone       TEXT,
  email       TEXT,
  website     TEXT,
  currency    TEXT NOT NULL DEFAULT 'EGP',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS erp_companies_updated ON erp_companies;
CREATE TRIGGER erp_companies_updated
  BEFORE UPDATE ON erp_companies
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

-- 3b. Branches
CREATE TABLE IF NOT EXISTS erp_branches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,              -- short code, e.g. 'CAI', 'ALX'
  name        TEXT NOT NULL,
  name_ar     TEXT,
  address     TEXT,
  city        TEXT,
  phone       TEXT,
  email       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  is_hq       BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, code)
);

DROP TRIGGER IF EXISTS erp_branches_updated ON erp_branches;
CREATE TRIGGER erp_branches_updated
  BEFORE UPDATE ON erp_branches
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_erp_branches_company ON erp_branches(company_id);

-- 3c. User-Branch assignments (many-to-many)
CREATE TABLE IF NOT EXISTS erp_user_branches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,              -- FK to auth.users
  branch_id   UUID NOT NULL REFERENCES erp_branches(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'staff',  -- branch-level role
  is_default  BOOLEAN NOT NULL DEFAULT false, -- default branch for this user
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_erp_user_branches_user ON erp_user_branches(user_id);
CREATE INDEX IF NOT EXISTS idx_erp_user_branches_branch ON erp_user_branches(branch_id);

-- ============================================================================
-- 4. RLS HELPER: user_branch_ids()
-- Returns an array of branch UUIDs the current user is assigned to.
-- ============================================================================
CREATE OR REPLACE FUNCTION erp_user_branch_ids()
RETURNS UUID[] AS $$
  SELECT COALESCE(
    array_agg(branch_id),
    '{}'::UUID[]
  )
  FROM erp_user_branches
  WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================================
-- 5. INVENTORY / WAREHOUSE
-- ============================================================================

-- 5a. Warehouses
CREATE TABLE IF NOT EXISTS erp_warehouses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   UUID NOT NULL REFERENCES erp_branches(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  name_ar     TEXT,
  location    TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(branch_id, code)
);

DROP TRIGGER IF EXISTS erp_warehouses_updated ON erp_warehouses;
CREATE TRIGGER erp_warehouses_updated
  BEFORE UPDATE ON erp_warehouses
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_erp_warehouses_branch ON erp_warehouses(branch_id);

-- 5b. Product Categories (hierarchical)
CREATE TABLE IF NOT EXISTS erp_product_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   UUID REFERENCES erp_product_categories(id) ON DELETE SET NULL,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  name_ar     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS erp_product_categories_updated ON erp_product_categories;
CREATE TRIGGER erp_product_categories_updated
  BEFORE UPDATE ON erp_product_categories
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_erp_product_categories_parent ON erp_product_categories(parent_id);

-- 5c. Products Catalog (master)
CREATE TABLE IF NOT EXISTS erp_products_catalog (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  name_ar     TEXT,
  barcode     TEXT,
  category_id UUID REFERENCES erp_product_categories(id) ON DELETE SET NULL,
  unit        TEXT NOT NULL DEFAULT 'piece',  -- piece, kg, liter, box, carton
  cost_price  NUMERIC(14,2) NOT NULL DEFAULT 0,
  sell_price  NUMERIC(14,2) NOT NULL DEFAULT 0,
  min_stock   NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate    NUMERIC(5,2) NOT NULL DEFAULT 0,  -- e.g. 14 for 14% VAT
  is_active   BOOLEAN NOT NULL DEFAULT true,
  image_url   TEXT,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS erp_products_catalog_updated ON erp_products_catalog;
CREATE TRIGGER erp_products_catalog_updated
  BEFORE UPDATE ON erp_products_catalog
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_erp_products_catalog_category ON erp_products_catalog(category_id);
CREATE INDEX IF NOT EXISTS idx_erp_products_catalog_barcode ON erp_products_catalog(barcode);
CREATE INDEX IF NOT EXISTS idx_erp_products_catalog_code ON erp_products_catalog(code);

-- 5d. Inventory Stock (current stock per product per warehouse)
CREATE TABLE IF NOT EXISTS erp_inventory_stock (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id  UUID NOT NULL REFERENCES erp_warehouses(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES erp_products_catalog(id) ON DELETE CASCADE,
  quantity      NUMERIC(14,3) NOT NULL DEFAULT 0,
  reserved_qty  NUMERIC(14,3) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(warehouse_id, product_id)
);

DROP TRIGGER IF EXISTS erp_inventory_stock_updated ON erp_inventory_stock;
CREATE TRIGGER erp_inventory_stock_updated
  BEFORE UPDATE ON erp_inventory_stock
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_erp_inventory_stock_warehouse ON erp_inventory_stock(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_erp_inventory_stock_product ON erp_inventory_stock(product_id);

-- 5e. Stock Movements (every movement is recorded)
CREATE TABLE IF NOT EXISTS erp_stock_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_type   erp_stock_movement_type NOT NULL,
  warehouse_id    UUID NOT NULL REFERENCES erp_warehouses(id) ON DELETE RESTRICT,
  product_id      UUID NOT NULL REFERENCES erp_products_catalog(id) ON DELETE RESTRICT,
  quantity        NUMERIC(14,3) NOT NULL,  -- signed: positive=in, negative=out
  reference_type  TEXT,                     -- 'invoice', 'purchase_order', 'transfer', 'manual'
  reference_id    UUID,                     -- FK to the source document
  notes           TEXT,
  created_by      UUID,                     -- FK to auth.users
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_stock_movements_warehouse ON erp_stock_movements(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_erp_stock_movements_product ON erp_stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_erp_stock_movements_type ON erp_stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_erp_stock_movements_ref ON erp_stock_movements(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_erp_stock_movements_created ON erp_stock_movements(created_at);

-- 5f. Transfer Orders (warehouse-to-warehouse)
CREATE TABLE IF NOT EXISTS erp_transfer_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number   TEXT NOT NULL UNIQUE,
  from_warehouse_id UUID NOT NULL REFERENCES erp_warehouses(id) ON DELETE RESTRICT,
  to_warehouse_id   UUID NOT NULL REFERENCES erp_warehouses(id) ON DELETE RESTRICT,
  status            erp_transfer_status NOT NULL DEFAULT 'draft',
  notes             TEXT,
  created_by        UUID,
  approved_by       UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT erp_transfer_different_warehouses CHECK (from_warehouse_id <> to_warehouse_id)
);

DROP TRIGGER IF EXISTS erp_transfer_orders_updated ON erp_transfer_orders;
CREATE TRIGGER erp_transfer_orders_updated
  BEFORE UPDATE ON erp_transfer_orders
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_erp_transfer_orders_from ON erp_transfer_orders(from_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_erp_transfer_orders_to ON erp_transfer_orders(to_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_erp_transfer_orders_status ON erp_transfer_orders(status);

-- 5g. Transfer Order Lines
CREATE TABLE IF NOT EXISTS erp_transfer_order_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_order_id UUID NOT NULL REFERENCES erp_transfer_orders(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES erp_products_catalog(id) ON DELETE RESTRICT,
  quantity          NUMERIC(14,3) NOT NULL,
  received_qty      NUMERIC(14,3) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_transfer_order_lines_order ON erp_transfer_order_lines(transfer_order_id);
CREATE INDEX IF NOT EXISTS idx_erp_transfer_order_lines_product ON erp_transfer_order_lines(product_id);

-- ============================================================================
-- 6. SALES
-- ============================================================================

-- 6a. Price Lists
CREATE TABLE IF NOT EXISTS erp_price_lists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  name_ar     TEXT,
  branch_id   UUID REFERENCES erp_branches(id) ON DELETE SET NULL,  -- NULL = global
  is_default  BOOLEAN NOT NULL DEFAULT false,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS erp_price_lists_updated ON erp_price_lists;
CREATE TRIGGER erp_price_lists_updated
  BEFORE UPDATE ON erp_price_lists
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_erp_price_lists_branch ON erp_price_lists(branch_id);

-- 6b. Price List Items
CREATE TABLE IF NOT EXISTS erp_price_list_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id UUID NOT NULL REFERENCES erp_price_lists(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES erp_products_catalog(id) ON DELETE CASCADE,
  unit_price    NUMERIC(14,2) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(price_list_id, product_id)
);

DROP TRIGGER IF EXISTS erp_price_list_items_updated ON erp_price_list_items;
CREATE TRIGGER erp_price_list_items_updated
  BEFORE UPDATE ON erp_price_list_items
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_erp_price_list_items_list ON erp_price_list_items(price_list_id);
CREATE INDEX IF NOT EXISTS idx_erp_price_list_items_product ON erp_price_list_items(product_id);

-- 6c. ERP Customers (sales-side, may coexist with existing customers table)
CREATE TABLE IF NOT EXISTS erp_customers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  name_ar     TEXT,
  phone       TEXT,
  email       TEXT,
  address     TEXT,
  city        TEXT,
  tax_number  TEXT,
  credit_limit NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance     NUMERIC(14,2) NOT NULL DEFAULT 0,  -- outstanding receivable
  branch_id   UUID REFERENCES erp_branches(id) ON DELETE SET NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS erp_customers_updated ON erp_customers;
CREATE TRIGGER erp_customers_updated
  BEFORE UPDATE ON erp_customers
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_erp_customers_branch ON erp_customers(branch_id);
CREATE INDEX IF NOT EXISTS idx_erp_customers_code ON erp_customers(code);

-- 6d. Sales Orders
CREATE TABLE IF NOT EXISTS erp_sales_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id       UUID NOT NULL REFERENCES erp_branches(id) ON DELETE RESTRICT,
  customer_id     UUID NOT NULL REFERENCES erp_customers(id) ON DELETE RESTRICT,
  order_number    TEXT NOT NULL UNIQUE,
  status          erp_sales_order_status NOT NULL DEFAULT 'draft',
  total_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  salesman_id     UUID,                       -- FK to auth.users
  created_by      UUID,                       -- FK to auth.users
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS erp_sales_orders_updated ON erp_sales_orders;
CREATE TRIGGER erp_sales_orders_updated
  BEFORE UPDATE ON erp_sales_orders
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_erp_sales_orders_branch ON erp_sales_orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_erp_sales_orders_customer ON erp_sales_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_erp_sales_orders_status ON erp_sales_orders(status);
CREATE INDEX IF NOT EXISTS idx_erp_sales_orders_number ON erp_sales_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_erp_sales_orders_salesman ON erp_sales_orders(salesman_id);

-- 6e. Sales Order Lines
CREATE TABLE IF NOT EXISTS erp_sales_order_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id  UUID NOT NULL REFERENCES erp_sales_orders(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES erp_products_catalog(id) ON DELETE RESTRICT,
  quantity        NUMERIC(14,3) NOT NULL,
  unit_price      NUMERIC(14,2) NOT NULL,
  discount_pct    NUMERIC(5,2) NOT NULL DEFAULT 0,
  line_total      NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_sales_order_lines_order ON erp_sales_order_lines(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_erp_sales_order_lines_product ON erp_sales_order_lines(product_id);

-- 6f. Invoices
CREATE TABLE IF NOT EXISTS erp_invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id       UUID NOT NULL REFERENCES erp_branches(id) ON DELETE RESTRICT,
  customer_id     UUID NOT NULL REFERENCES erp_customers(id) ON DELETE RESTRICT,
  invoice_number  TEXT NOT NULL UNIQUE,
  sales_order_id  UUID REFERENCES erp_sales_orders(id) ON DELETE SET NULL,
  status          erp_invoice_status NOT NULL DEFAULT 'draft',
  total_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  due_date        DATE,
  paid_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS erp_invoices_updated ON erp_invoices;
CREATE TRIGGER erp_invoices_updated
  BEFORE UPDATE ON erp_invoices
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_erp_invoices_branch ON erp_invoices(branch_id);
CREATE INDEX IF NOT EXISTS idx_erp_invoices_customer ON erp_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_erp_invoices_status ON erp_invoices(status);
CREATE INDEX IF NOT EXISTS idx_erp_invoices_number ON erp_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_erp_invoices_sales_order ON erp_invoices(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_erp_invoices_due_date ON erp_invoices(due_date);

-- 6g. Invoice Lines
CREATE TABLE IF NOT EXISTS erp_invoice_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID NOT NULL REFERENCES erp_invoices(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES erp_products_catalog(id) ON DELETE RESTRICT,
  quantity      NUMERIC(14,3) NOT NULL,
  unit_price    NUMERIC(14,2) NOT NULL,
  discount_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
  line_total    NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_invoice_lines_invoice ON erp_invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_erp_invoice_lines_product ON erp_invoice_lines(product_id);

-- 6h. Payments (customer payments against invoices)
CREATE TABLE IF NOT EXISTS erp_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id        UUID NOT NULL REFERENCES erp_invoices(id) ON DELETE RESTRICT,
  amount            NUMERIC(14,2) NOT NULL,
  payment_method    erp_payment_method NOT NULL DEFAULT 'cash',
  reference_number  TEXT,
  payment_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  notes             TEXT,
  received_by       UUID,            -- FK to auth.users
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_payments_invoice ON erp_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_erp_payments_date ON erp_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_erp_payments_method ON erp_payments(payment_method);

-- 6i. Sales Returns
CREATE TABLE IF NOT EXISTS erp_sales_returns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id       UUID NOT NULL REFERENCES erp_branches(id) ON DELETE RESTRICT,
  customer_id     UUID NOT NULL REFERENCES erp_customers(id) ON DELETE RESTRICT,
  invoice_id      UUID REFERENCES erp_invoices(id) ON DELETE SET NULL,
  return_number   TEXT NOT NULL UNIQUE,
  status          erp_return_status NOT NULL DEFAULT 'draft',
  total_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  reason          TEXT,
  notes           TEXT,
  approved_by     UUID,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS erp_sales_returns_updated ON erp_sales_returns;
CREATE TRIGGER erp_sales_returns_updated
  BEFORE UPDATE ON erp_sales_returns
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_erp_sales_returns_branch ON erp_sales_returns(branch_id);
CREATE INDEX IF NOT EXISTS idx_erp_sales_returns_customer ON erp_sales_returns(customer_id);
CREATE INDEX IF NOT EXISTS idx_erp_sales_returns_invoice ON erp_sales_returns(invoice_id);
CREATE INDEX IF NOT EXISTS idx_erp_sales_returns_status ON erp_sales_returns(status);

-- 6j. Sales Return Lines
CREATE TABLE IF NOT EXISTS erp_sales_return_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id     UUID NOT NULL REFERENCES erp_sales_returns(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES erp_products_catalog(id) ON DELETE RESTRICT,
  quantity      NUMERIC(14,3) NOT NULL,
  unit_price    NUMERIC(14,2) NOT NULL,
  line_total    NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_sales_return_lines_return ON erp_sales_return_lines(return_id);
CREATE INDEX IF NOT EXISTS idx_erp_sales_return_lines_product ON erp_sales_return_lines(product_id);

-- ============================================================================
-- 7. PROCUREMENT / PURCHASES
-- ============================================================================

-- 7a. Suppliers
CREATE TABLE IF NOT EXISTS erp_suppliers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  name_ar     TEXT,
  phone       TEXT,
  email       TEXT,
  address     TEXT,
  city        TEXT,
  tax_number  TEXT,
  balance     NUMERIC(14,2) NOT NULL DEFAULT 0,  -- outstanding payable
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS erp_suppliers_updated ON erp_suppliers;
CREATE TRIGGER erp_suppliers_updated
  BEFORE UPDATE ON erp_suppliers
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_erp_suppliers_code ON erp_suppliers(code);

-- 7b. Purchase Orders
CREATE TABLE IF NOT EXISTS erp_purchase_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id       UUID NOT NULL REFERENCES erp_branches(id) ON DELETE RESTRICT,
  supplier_id     UUID NOT NULL REFERENCES erp_suppliers(id) ON DELETE RESTRICT,
  po_number       TEXT NOT NULL UNIQUE,
  status          erp_po_status NOT NULL DEFAULT 'draft',
  total_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  created_by      UUID,
  approved_by     UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS erp_purchase_orders_updated ON erp_purchase_orders;
CREATE TRIGGER erp_purchase_orders_updated
  BEFORE UPDATE ON erp_purchase_orders
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_erp_purchase_orders_branch ON erp_purchase_orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_erp_purchase_orders_supplier ON erp_purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_erp_purchase_orders_status ON erp_purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_erp_purchase_orders_number ON erp_purchase_orders(po_number);

-- 7c. Purchase Order Lines
CREATE TABLE IF NOT EXISTS erp_purchase_order_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES erp_purchase_orders(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES erp_products_catalog(id) ON DELETE RESTRICT,
  quantity          NUMERIC(14,3) NOT NULL,
  unit_price        NUMERIC(14,2) NOT NULL,
  received_qty      NUMERIC(14,3) NOT NULL DEFAULT 0,
  line_total        NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_po_lines_order ON erp_purchase_order_lines(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_erp_po_lines_product ON erp_purchase_order_lines(product_id);

-- 7d. Goods Receipts (receiving purchase orders into warehouse)
CREATE TABLE IF NOT EXISTS erp_goods_receipts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES erp_purchase_orders(id) ON DELETE RESTRICT,
  warehouse_id      UUID NOT NULL REFERENCES erp_warehouses(id) ON DELETE RESTRICT,
  receipt_number    TEXT NOT NULL UNIQUE,
  notes             TEXT,
  received_by       UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_goods_receipts_po ON erp_goods_receipts(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_erp_goods_receipts_warehouse ON erp_goods_receipts(warehouse_id);

-- 7e. Goods Receipt Lines
CREATE TABLE IF NOT EXISTS erp_goods_receipt_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_receipt_id  UUID NOT NULL REFERENCES erp_goods_receipts(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES erp_products_catalog(id) ON DELETE RESTRICT,
  quantity_received NUMERIC(14,3) NOT NULL,
  batch_number      TEXT,
  expiry_date       DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_gr_lines_receipt ON erp_goods_receipt_lines(goods_receipt_id);
CREATE INDEX IF NOT EXISTS idx_erp_gr_lines_product ON erp_goods_receipt_lines(product_id);

-- 7f. Supplier Payments
CREATE TABLE IF NOT EXISTS erp_supplier_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id       UUID NOT NULL REFERENCES erp_suppliers(id) ON DELETE RESTRICT,
  amount            NUMERIC(14,2) NOT NULL,
  payment_method    erp_payment_method NOT NULL DEFAULT 'bank_transfer',
  reference_number  TEXT,
  payment_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  notes             TEXT,
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_supplier_payments_supplier ON erp_supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_erp_supplier_payments_date ON erp_supplier_payments(payment_date);

-- ============================================================================
-- 8. ACCOUNTING
-- ============================================================================

-- 8a. Chart of Accounts
CREATE TABLE IF NOT EXISTS erp_chart_of_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  name_ar       TEXT,
  account_type  erp_account_type NOT NULL,
  parent_id     UUID REFERENCES erp_chart_of_accounts(id) ON DELETE SET NULL,
  is_group      BOOLEAN NOT NULL DEFAULT false,
  is_system     BOOLEAN NOT NULL DEFAULT false,    -- system accounts cannot be deleted
  branch_id     UUID REFERENCES erp_branches(id) ON DELETE SET NULL,  -- NULL = shared
  balance       NUMERIC(14,2) NOT NULL DEFAULT 0,
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(code, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid))
);

DROP TRIGGER IF EXISTS erp_chart_of_accounts_updated ON erp_chart_of_accounts;
CREATE TRIGGER erp_chart_of_accounts_updated
  BEFORE UPDATE ON erp_chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_erp_coa_parent ON erp_chart_of_accounts(parent_id);
CREATE INDEX IF NOT EXISTS idx_erp_coa_type ON erp_chart_of_accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_erp_coa_branch ON erp_chart_of_accounts(branch_id);
CREATE INDEX IF NOT EXISTS idx_erp_coa_code ON erp_chart_of_accounts(code);

-- 8b. Fiscal Periods
CREATE TABLE IF NOT EXISTS erp_fiscal_periods (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  status      erp_fiscal_period_status NOT NULL DEFAULT 'open',
  branch_id   UUID REFERENCES erp_branches(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT erp_fiscal_period_dates CHECK (end_date >= start_date)
);

DROP TRIGGER IF EXISTS erp_fiscal_periods_updated ON erp_fiscal_periods;
CREATE TRIGGER erp_fiscal_periods_updated
  BEFORE UPDATE ON erp_fiscal_periods
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_erp_fiscal_periods_branch ON erp_fiscal_periods(branch_id);
CREATE INDEX IF NOT EXISTS idx_erp_fiscal_periods_status ON erp_fiscal_periods(status);
CREATE INDEX IF NOT EXISTS idx_erp_fiscal_periods_dates ON erp_fiscal_periods(start_date, end_date);

-- 8c. Cost Centers
CREATE TABLE IF NOT EXISTS erp_cost_centers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  name_ar     TEXT,
  branch_id   UUID REFERENCES erp_branches(id) ON DELETE SET NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(code, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid))
);

DROP TRIGGER IF EXISTS erp_cost_centers_updated ON erp_cost_centers;
CREATE TRIGGER erp_cost_centers_updated
  BEFORE UPDATE ON erp_cost_centers
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_erp_cost_centers_branch ON erp_cost_centers(branch_id);

-- 8d. Journal Entries
CREATE TABLE IF NOT EXISTS erp_journal_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_number      TEXT NOT NULL UNIQUE,
  entry_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  description       TEXT,
  reference_type    TEXT,           -- 'invoice', 'payment', 'purchase', 'manual', etc.
  reference_id      UUID,
  branch_id         UUID REFERENCES erp_branches(id) ON DELETE RESTRICT,
  fiscal_period_id  UUID REFERENCES erp_fiscal_periods(id) ON DELETE RESTRICT,
  status            erp_journal_status NOT NULL DEFAULT 'draft',
  created_by        UUID,
  posted_by         UUID,
  posted_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS erp_journal_entries_updated ON erp_journal_entries;
CREATE TRIGGER erp_journal_entries_updated
  BEFORE UPDATE ON erp_journal_entries
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_erp_journal_entries_branch ON erp_journal_entries(branch_id);
CREATE INDEX IF NOT EXISTS idx_erp_journal_entries_fiscal ON erp_journal_entries(fiscal_period_id);
CREATE INDEX IF NOT EXISTS idx_erp_journal_entries_status ON erp_journal_entries(status);
CREATE INDEX IF NOT EXISTS idx_erp_journal_entries_ref ON erp_journal_entries(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_erp_journal_entries_date ON erp_journal_entries(entry_date);

-- 8e. Journal Lines
CREATE TABLE IF NOT EXISTS erp_journal_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES erp_journal_entries(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES erp_chart_of_accounts(id) ON DELETE RESTRICT,
  debit           NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit          NUMERIC(14,2) NOT NULL DEFAULT 0,
  cost_center_id  UUID REFERENCES erp_cost_centers(id) ON DELETE SET NULL,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT erp_journal_line_not_both CHECK (
    NOT (debit > 0 AND credit > 0)
  ),
  CONSTRAINT erp_journal_line_not_zero CHECK (
    debit > 0 OR credit > 0
  )
);

CREATE INDEX IF NOT EXISTS idx_erp_journal_lines_entry ON erp_journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_erp_journal_lines_account ON erp_journal_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_erp_journal_lines_cost_center ON erp_journal_lines(cost_center_id);

-- 8f. Payment Vouchers
CREATE TABLE IF NOT EXISTS erp_payment_vouchers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_number  TEXT NOT NULL UNIQUE,
  voucher_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  payee           TEXT NOT NULL,
  amount          NUMERIC(14,2) NOT NULL,
  account_id      UUID NOT NULL REFERENCES erp_chart_of_accounts(id) ON DELETE RESTRICT,
  branch_id       UUID NOT NULL REFERENCES erp_branches(id) ON DELETE RESTRICT,
  notes           TEXT,
  status          erp_voucher_status NOT NULL DEFAULT 'draft',
  created_by      UUID,
  approved_by     UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS erp_payment_vouchers_updated ON erp_payment_vouchers;
CREATE TRIGGER erp_payment_vouchers_updated
  BEFORE UPDATE ON erp_payment_vouchers
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_erp_payment_vouchers_branch ON erp_payment_vouchers(branch_id);
CREATE INDEX IF NOT EXISTS idx_erp_payment_vouchers_account ON erp_payment_vouchers(account_id);
CREATE INDEX IF NOT EXISTS idx_erp_payment_vouchers_status ON erp_payment_vouchers(status);

-- 8g. Receipt Vouchers
CREATE TABLE IF NOT EXISTS erp_receipt_vouchers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_number  TEXT NOT NULL UNIQUE,
  voucher_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  payer           TEXT NOT NULL,
  amount          NUMERIC(14,2) NOT NULL,
  account_id      UUID NOT NULL REFERENCES erp_chart_of_accounts(id) ON DELETE RESTRICT,
  branch_id       UUID NOT NULL REFERENCES erp_branches(id) ON DELETE RESTRICT,
  notes           TEXT,
  status          erp_voucher_status NOT NULL DEFAULT 'draft',
  created_by      UUID,
  approved_by     UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS erp_receipt_vouchers_updated ON erp_receipt_vouchers;
CREATE TRIGGER erp_receipt_vouchers_updated
  BEFORE UPDATE ON erp_receipt_vouchers
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_erp_receipt_vouchers_branch ON erp_receipt_vouchers(branch_id);
CREATE INDEX IF NOT EXISTS idx_erp_receipt_vouchers_account ON erp_receipt_vouchers(account_id);
CREATE INDEX IF NOT EXISTS idx_erp_receipt_vouchers_status ON erp_receipt_vouchers(status);

-- 8h. Bank Accounts
CREATE TABLE IF NOT EXISTS erp_bank_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  bank_name       TEXT NOT NULL,
  account_number  TEXT NOT NULL,
  iban            TEXT,
  swift_code      TEXT,
  branch_id       UUID NOT NULL REFERENCES erp_branches(id) ON DELETE RESTRICT,
  account_id      UUID REFERENCES erp_chart_of_accounts(id) ON DELETE SET NULL,  -- linked GL account
  balance         NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS erp_bank_accounts_updated ON erp_bank_accounts;
CREATE TRIGGER erp_bank_accounts_updated
  BEFORE UPDATE ON erp_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_erp_bank_accounts_branch ON erp_bank_accounts(branch_id);
CREATE INDEX IF NOT EXISTS idx_erp_bank_accounts_account ON erp_bank_accounts(account_id);

-- ============================================================================
-- 9. SEQUENCES & AUTO-NUMBERING
-- ============================================================================

-- Sequence table for branch-scoped counters
CREATE TABLE IF NOT EXISTS erp_sequences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   UUID NOT NULL REFERENCES erp_branches(id) ON DELETE CASCADE,
  seq_type    TEXT NOT NULL,   -- 'invoice', 'sales_order', 'purchase_order', 'journal', 'transfer', 'receipt', 'return', 'payment_voucher', 'receipt_voucher', 'goods_receipt'
  prefix      TEXT NOT NULL,   -- e.g. 'INV', 'SO', 'PO', 'JV', 'TR', 'GR', 'RET', 'PV', 'RV'
  current_val BIGINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(branch_id, seq_type)
);

-- Function: generate next number for a given branch and document type
-- Returns format like: INV-CAI-0001, PO-ALX-0002
CREATE OR REPLACE FUNCTION erp_next_number(
  p_branch_id UUID,
  p_seq_type  TEXT
)
RETURNS TEXT AS $$
DECLARE
  v_prefix TEXT;
  v_branch_code TEXT;
  v_next BIGINT;
  v_result TEXT;
BEGIN
  -- Get branch code
  SELECT code INTO v_branch_code
  FROM erp_branches
  WHERE id = p_branch_id;

  IF v_branch_code IS NULL THEN
    RAISE EXCEPTION 'Branch not found: %', p_branch_id;
  END IF;

  -- Upsert the sequence and increment atomically
  INSERT INTO erp_sequences (branch_id, seq_type, prefix, current_val)
  VALUES (
    p_branch_id,
    p_seq_type,
    CASE p_seq_type
      WHEN 'invoice'          THEN 'INV'
      WHEN 'sales_order'      THEN 'SO'
      WHEN 'purchase_order'   THEN 'PO'
      WHEN 'journal'          THEN 'JV'
      WHEN 'transfer'         THEN 'TR'
      WHEN 'goods_receipt'    THEN 'GR'
      WHEN 'return'           THEN 'RET'
      WHEN 'payment_voucher'  THEN 'PV'
      WHEN 'receipt_voucher'  THEN 'RV'
      ELSE UPPER(LEFT(p_seq_type, 3))
    END,
    1
  )
  ON CONFLICT (branch_id, seq_type) DO UPDATE
    SET current_val = erp_sequences.current_val + 1
  RETURNING prefix, current_val INTO v_prefix, v_next;

  v_result := v_prefix || '-' || v_branch_code || '-' || LPAD(v_next::TEXT, 6, '0');
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 10. TRIGGERS: BUSINESS LOGIC
-- ============================================================================

-- --------------------------------------------------------------------------
-- 10a. Update inventory on stock movement insert
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp_trg_update_inventory_on_movement()
RETURNS TRIGGER AS $$
BEGIN
  -- Upsert inventory_stock: add the movement quantity (which is signed)
  INSERT INTO erp_inventory_stock (warehouse_id, product_id, quantity)
  VALUES (NEW.warehouse_id, NEW.product_id, NEW.quantity)
  ON CONFLICT (warehouse_id, product_id) DO UPDATE
    SET quantity = erp_inventory_stock.quantity + EXCLUDED.quantity,
        updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_erp_stock_movement_inventory ON erp_stock_movements;
CREATE TRIGGER trg_erp_stock_movement_inventory
  AFTER INSERT ON erp_stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION erp_trg_update_inventory_on_movement();

-- --------------------------------------------------------------------------
-- 10b. Create journal entry when invoice status changes to 'issued'
--      Debit: Accounts Receivable, Credit: Revenue
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp_trg_journal_on_invoice_issued()
RETURNS TRIGGER AS $$
DECLARE
  v_entry_number TEXT;
  v_entry_id UUID;
  v_ar_account_id UUID;
  v_revenue_account_id UUID;
  v_fiscal_period_id UUID;
BEGIN
  -- Only fire when status changes TO 'issued'
  IF NEW.status = 'issued' AND (OLD.status IS DISTINCT FROM 'issued') THEN

    -- Find Accounts Receivable account (system code '1200')
    SELECT id INTO v_ar_account_id
    FROM erp_chart_of_accounts
    WHERE code = '1200' AND is_system = true
    LIMIT 1;

    -- Find Revenue account (system code '4100')
    SELECT id INTO v_revenue_account_id
    FROM erp_chart_of_accounts
    WHERE code = '4100' AND is_system = true
    LIMIT 1;

    -- Find current fiscal period for the branch
    SELECT id INTO v_fiscal_period_id
    FROM erp_fiscal_periods
    WHERE status = 'open'
      AND (branch_id IS NULL OR branch_id = NEW.branch_id)
      AND CURRENT_DATE BETWEEN start_date AND end_date
    ORDER BY branch_id NULLS LAST
    LIMIT 1;

    -- Only create journal if we have the required accounts
    IF v_ar_account_id IS NOT NULL AND v_revenue_account_id IS NOT NULL THEN
      -- Generate journal entry number
      v_entry_number := erp_next_number(NEW.branch_id, 'journal');
      v_entry_id := gen_random_uuid();

      INSERT INTO erp_journal_entries (
        id, entry_number, entry_date, description,
        reference_type, reference_id, branch_id,
        fiscal_period_id, status, created_by
      ) VALUES (
        v_entry_id, v_entry_number, CURRENT_DATE,
        'Auto: Invoice ' || NEW.invoice_number || ' issued',
        'invoice', NEW.id, NEW.branch_id,
        v_fiscal_period_id, 'posted', NEW.created_by
      );

      -- Debit AR
      INSERT INTO erp_journal_lines (journal_entry_id, account_id, debit, credit, description)
      VALUES (v_entry_id, v_ar_account_id, NEW.net_amount, 0, 'AR - Invoice ' || NEW.invoice_number);

      -- Credit Revenue
      INSERT INTO erp_journal_lines (journal_entry_id, account_id, debit, credit, description)
      VALUES (v_entry_id, v_revenue_account_id, 0, NEW.net_amount, 'Revenue - Invoice ' || NEW.invoice_number);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_erp_journal_on_invoice ON erp_invoices;
CREATE TRIGGER trg_erp_journal_on_invoice
  AFTER UPDATE ON erp_invoices
  FOR EACH ROW
  EXECUTE FUNCTION erp_trg_journal_on_invoice_issued();

-- --------------------------------------------------------------------------
-- 10c. Create journal entry when payment is received
--      Debit: Cash/Bank, Credit: Accounts Receivable
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp_trg_journal_on_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_entry_number TEXT;
  v_entry_id UUID;
  v_cash_account_id UUID;
  v_ar_account_id UUID;
  v_invoice RECORD;
  v_fiscal_period_id UUID;
  v_total_paid NUMERIC(14,2);
BEGIN
  -- Get invoice details
  SELECT * INTO v_invoice FROM erp_invoices WHERE id = NEW.invoice_id;

  IF v_invoice IS NULL THEN
    RETURN NEW;
  END IF;

  -- Find Cash account (system code '1100')
  SELECT id INTO v_cash_account_id
  FROM erp_chart_of_accounts
  WHERE code = '1100' AND is_system = true
  LIMIT 1;

  -- Find AR account (system code '1200')
  SELECT id INTO v_ar_account_id
  FROM erp_chart_of_accounts
  WHERE code = '1200' AND is_system = true
  LIMIT 1;

  -- Find current fiscal period
  SELECT id INTO v_fiscal_period_id
  FROM erp_fiscal_periods
  WHERE status = 'open'
    AND (branch_id IS NULL OR branch_id = v_invoice.branch_id)
    AND CURRENT_DATE BETWEEN start_date AND end_date
  ORDER BY branch_id NULLS LAST
  LIMIT 1;

  IF v_cash_account_id IS NOT NULL AND v_ar_account_id IS NOT NULL THEN
    v_entry_number := erp_next_number(v_invoice.branch_id, 'journal');
    v_entry_id := gen_random_uuid();

    INSERT INTO erp_journal_entries (
      id, entry_number, entry_date, description,
      reference_type, reference_id, branch_id,
      fiscal_period_id, status, created_by
    ) VALUES (
      v_entry_id, v_entry_number, NEW.payment_date,
      'Auto: Payment received for Invoice ' || v_invoice.invoice_number,
      'payment', NEW.id, v_invoice.branch_id,
      v_fiscal_period_id, 'posted', NEW.received_by
    );

    -- Debit Cash/Bank
    INSERT INTO erp_journal_lines (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_entry_id, v_cash_account_id, NEW.amount, 0, 'Cash - Payment for ' || v_invoice.invoice_number);

    -- Credit AR
    INSERT INTO erp_journal_lines (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_entry_id, v_ar_account_id, 0, NEW.amount, 'AR - Payment for ' || v_invoice.invoice_number);
  END IF;

  -- Update invoice paid_amount and status
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM erp_payments
  WHERE invoice_id = NEW.invoice_id;

  UPDATE erp_invoices
  SET paid_amount = v_total_paid,
      status = CASE
        WHEN v_total_paid >= net_amount THEN 'paid'::erp_invoice_status
        WHEN v_total_paid > 0 THEN 'partially_paid'::erp_invoice_status
        ELSE status
      END
  WHERE id = NEW.invoice_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_erp_journal_on_payment ON erp_payments;
CREATE TRIGGER trg_erp_journal_on_payment
  AFTER INSERT ON erp_payments
  FOR EACH ROW
  EXECUTE FUNCTION erp_trg_journal_on_payment();

-- --------------------------------------------------------------------------
-- 10d. Create journal entry when goods receipt is created
--      Debit: Inventory, Credit: Accounts Payable
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp_trg_journal_on_goods_receipt()
RETURNS TRIGGER AS $$
DECLARE
  v_entry_number TEXT;
  v_entry_id UUID;
  v_inventory_account_id UUID;
  v_ap_account_id UUID;
  v_po RECORD;
  v_branch_id UUID;
  v_fiscal_period_id UUID;
  v_receipt_total NUMERIC(14,2);
  v_line RECORD;
BEGIN
  -- Get PO and branch info
  SELECT po.*, b.id AS branch_id_val
  INTO v_po
  FROM erp_purchase_orders po
  JOIN erp_branches b ON b.id = po.branch_id
  WHERE po.id = NEW.purchase_order_id;

  IF v_po IS NULL THEN
    RETURN NEW;
  END IF;

  v_branch_id := v_po.branch_id;

  -- Calculate receipt total from lines
  SELECT COALESCE(SUM(grl.quantity_received * pol.unit_price), 0) INTO v_receipt_total
  FROM erp_goods_receipt_lines grl
  JOIN erp_purchase_order_lines pol ON pol.product_id = grl.product_id
    AND pol.purchase_order_id = NEW.purchase_order_id
  WHERE grl.goods_receipt_id = NEW.id;

  -- If no lines yet (trigger fires on receipt insert before lines), use PO total
  IF v_receipt_total = 0 THEN
    v_receipt_total := v_po.net_amount;
  END IF;

  -- Find Inventory account (system code '1300')
  SELECT id INTO v_inventory_account_id
  FROM erp_chart_of_accounts
  WHERE code = '1300' AND is_system = true
  LIMIT 1;

  -- Find AP account (system code '2100')
  SELECT id INTO v_ap_account_id
  FROM erp_chart_of_accounts
  WHERE code = '2100' AND is_system = true
  LIMIT 1;

  -- Find current fiscal period
  SELECT id INTO v_fiscal_period_id
  FROM erp_fiscal_periods
  WHERE status = 'open'
    AND (branch_id IS NULL OR branch_id = v_branch_id)
    AND CURRENT_DATE BETWEEN start_date AND end_date
  ORDER BY branch_id NULLS LAST
  LIMIT 1;

  IF v_inventory_account_id IS NOT NULL AND v_ap_account_id IS NOT NULL AND v_receipt_total > 0 THEN
    v_entry_number := erp_next_number(v_branch_id, 'journal');
    v_entry_id := gen_random_uuid();

    INSERT INTO erp_journal_entries (
      id, entry_number, entry_date, description,
      reference_type, reference_id, branch_id,
      fiscal_period_id, status, created_by
    ) VALUES (
      v_entry_id, v_entry_number, CURRENT_DATE,
      'Auto: Goods Receipt ' || NEW.receipt_number || ' for PO ' || v_po.po_number,
      'goods_receipt', NEW.id, v_branch_id,
      v_fiscal_period_id, 'posted', NEW.received_by
    );

    -- Debit Inventory
    INSERT INTO erp_journal_lines (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_entry_id, v_inventory_account_id, v_receipt_total, 0, 'Inventory - GR ' || NEW.receipt_number);

    -- Credit AP
    INSERT INTO erp_journal_lines (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_entry_id, v_ap_account_id, 0, v_receipt_total, 'AP - GR ' || NEW.receipt_number);
  END IF;

  -- Create stock movements for each receipt line
  FOR v_line IN
    SELECT grl.*, pol.unit_price
    FROM erp_goods_receipt_lines grl
    JOIN erp_purchase_order_lines pol ON pol.product_id = grl.product_id
      AND pol.purchase_order_id = NEW.purchase_order_id
    WHERE grl.goods_receipt_id = NEW.id
  LOOP
    INSERT INTO erp_stock_movements (
      movement_type, warehouse_id, product_id, quantity,
      reference_type, reference_id, notes, created_by
    ) VALUES (
      'purchase_in', NEW.warehouse_id, v_line.product_id, v_line.quantity_received,
      'goods_receipt', NEW.id, 'GR: ' || NEW.receipt_number, NEW.received_by
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: This trigger is on goods_receipt_lines insert (not the receipt itself)
-- because lines contain the actual products/quantities.
-- We also create a deferred trigger on the receipt for the journal entry.

-- Trigger for stock movements from receipt lines
CREATE OR REPLACE FUNCTION erp_trg_stock_on_receipt_line()
RETURNS TRIGGER AS $$
DECLARE
  v_receipt RECORD;
BEGIN
  SELECT * INTO v_receipt FROM erp_goods_receipts WHERE id = NEW.goods_receipt_id;

  IF v_receipt IS NOT NULL THEN
    INSERT INTO erp_stock_movements (
      movement_type, warehouse_id, product_id, quantity,
      reference_type, reference_id, notes, created_by
    ) VALUES (
      'purchase_in', v_receipt.warehouse_id, NEW.product_id, NEW.quantity_received,
      'goods_receipt', v_receipt.id, 'GR: ' || v_receipt.receipt_number, v_receipt.received_by
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_erp_stock_on_receipt_line ON erp_goods_receipt_lines;
CREATE TRIGGER trg_erp_stock_on_receipt_line
  AFTER INSERT ON erp_goods_receipt_lines
  FOR EACH ROW
  EXECUTE FUNCTION erp_trg_stock_on_receipt_line();

-- ============================================================================
-- 11. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all ERP tables
ALTER TABLE erp_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_user_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_products_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_inventory_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_transfer_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_transfer_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_price_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_sales_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_sales_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_sales_return_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_goods_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_fiscal_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_payment_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_receipt_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_sequences ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- RLS Policies: Companies (all authenticated users can read their company)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "erp_companies_select" ON erp_companies;
CREATE POLICY "erp_companies_select" ON erp_companies FOR SELECT
  USING (
    id IN (
      SELECT b.company_id FROM erp_branches b
      WHERE b.id = ANY(erp_user_branch_ids())
    )
  );

DROP POLICY IF EXISTS "erp_companies_manage" ON erp_companies;
CREATE POLICY "erp_companies_manage" ON erp_companies FOR ALL
  USING (
    id IN (
      SELECT b.company_id FROM erp_branches b
      WHERE b.id = ANY(erp_user_branch_ids())
    )
  );

-- --------------------------------------------------------------------------
-- RLS Policies: Branches (users see only their assigned branches)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "erp_branches_select" ON erp_branches;
CREATE POLICY "erp_branches_select" ON erp_branches FOR SELECT
  USING (id = ANY(erp_user_branch_ids()));

DROP POLICY IF EXISTS "erp_branches_manage" ON erp_branches;
CREATE POLICY "erp_branches_manage" ON erp_branches FOR ALL
  USING (id = ANY(erp_user_branch_ids()));

-- --------------------------------------------------------------------------
-- RLS Policies: User Branches (users see their own assignments)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "erp_user_branches_select" ON erp_user_branches;
CREATE POLICY "erp_user_branches_select" ON erp_user_branches FOR SELECT
  USING (user_id = auth.uid() OR branch_id = ANY(erp_user_branch_ids()));

DROP POLICY IF EXISTS "erp_user_branches_manage" ON erp_user_branches;
CREATE POLICY "erp_user_branches_manage" ON erp_user_branches FOR ALL
  USING (branch_id = ANY(erp_user_branch_ids()));

-- --------------------------------------------------------------------------
-- RLS Policies: Warehouses (branch-scoped)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "erp_warehouses_select" ON erp_warehouses;
CREATE POLICY "erp_warehouses_select" ON erp_warehouses FOR SELECT
  USING (branch_id = ANY(erp_user_branch_ids()));

DROP POLICY IF EXISTS "erp_warehouses_manage" ON erp_warehouses;
CREATE POLICY "erp_warehouses_manage" ON erp_warehouses FOR ALL
  USING (branch_id = ANY(erp_user_branch_ids()));

-- --------------------------------------------------------------------------
-- RLS Policies: Product Categories & Catalog (global, all authenticated)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "erp_product_categories_select" ON erp_product_categories;
CREATE POLICY "erp_product_categories_select" ON erp_product_categories FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "erp_product_categories_manage" ON erp_product_categories;
CREATE POLICY "erp_product_categories_manage" ON erp_product_categories FOR ALL
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "erp_products_catalog_select" ON erp_products_catalog;
CREATE POLICY "erp_products_catalog_select" ON erp_products_catalog FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "erp_products_catalog_manage" ON erp_products_catalog;
CREATE POLICY "erp_products_catalog_manage" ON erp_products_catalog FOR ALL
  USING (auth.uid() IS NOT NULL);

-- --------------------------------------------------------------------------
-- RLS Policies: Inventory Stock (via warehouse -> branch)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "erp_inventory_stock_select" ON erp_inventory_stock;
CREATE POLICY "erp_inventory_stock_select" ON erp_inventory_stock FOR SELECT
  USING (
    warehouse_id IN (
      SELECT w.id FROM erp_warehouses w
      WHERE w.branch_id = ANY(erp_user_branch_ids())
    )
  );

DROP POLICY IF EXISTS "erp_inventory_stock_manage" ON erp_inventory_stock;
CREATE POLICY "erp_inventory_stock_manage" ON erp_inventory_stock FOR ALL
  USING (
    warehouse_id IN (
      SELECT w.id FROM erp_warehouses w
      WHERE w.branch_id = ANY(erp_user_branch_ids())
    )
  );

-- --------------------------------------------------------------------------
-- RLS Policies: Stock Movements (via warehouse -> branch)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "erp_stock_movements_select" ON erp_stock_movements;
CREATE POLICY "erp_stock_movements_select" ON erp_stock_movements FOR SELECT
  USING (
    warehouse_id IN (
      SELECT w.id FROM erp_warehouses w
      WHERE w.branch_id = ANY(erp_user_branch_ids())
    )
  );

DROP POLICY IF EXISTS "erp_stock_movements_manage" ON erp_stock_movements;
CREATE POLICY "erp_stock_movements_manage" ON erp_stock_movements FOR ALL
  USING (
    warehouse_id IN (
      SELECT w.id FROM erp_warehouses w
      WHERE w.branch_id = ANY(erp_user_branch_ids())
    )
  );

-- --------------------------------------------------------------------------
-- RLS Policies: Transfer Orders (via warehouse -> branch)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "erp_transfer_orders_select" ON erp_transfer_orders;
CREATE POLICY "erp_transfer_orders_select" ON erp_transfer_orders FOR SELECT
  USING (
    from_warehouse_id IN (SELECT w.id FROM erp_warehouses w WHERE w.branch_id = ANY(erp_user_branch_ids()))
    OR
    to_warehouse_id IN (SELECT w.id FROM erp_warehouses w WHERE w.branch_id = ANY(erp_user_branch_ids()))
  );

DROP POLICY IF EXISTS "erp_transfer_orders_manage" ON erp_transfer_orders;
CREATE POLICY "erp_transfer_orders_manage" ON erp_transfer_orders FOR ALL
  USING (
    from_warehouse_id IN (SELECT w.id FROM erp_warehouses w WHERE w.branch_id = ANY(erp_user_branch_ids()))
    OR
    to_warehouse_id IN (SELECT w.id FROM erp_warehouses w WHERE w.branch_id = ANY(erp_user_branch_ids()))
  );

-- Transfer order lines: via parent transfer order
DROP POLICY IF EXISTS "erp_transfer_order_lines_select" ON erp_transfer_order_lines;
CREATE POLICY "erp_transfer_order_lines_select" ON erp_transfer_order_lines FOR SELECT
  USING (
    transfer_order_id IN (
      SELECT t.id FROM erp_transfer_orders t
      WHERE t.from_warehouse_id IN (SELECT w.id FROM erp_warehouses w WHERE w.branch_id = ANY(erp_user_branch_ids()))
         OR t.to_warehouse_id IN (SELECT w.id FROM erp_warehouses w WHERE w.branch_id = ANY(erp_user_branch_ids()))
    )
  );

DROP POLICY IF EXISTS "erp_transfer_order_lines_manage" ON erp_transfer_order_lines;
CREATE POLICY "erp_transfer_order_lines_manage" ON erp_transfer_order_lines FOR ALL
  USING (
    transfer_order_id IN (
      SELECT t.id FROM erp_transfer_orders t
      WHERE t.from_warehouse_id IN (SELECT w.id FROM erp_warehouses w WHERE w.branch_id = ANY(erp_user_branch_ids()))
         OR t.to_warehouse_id IN (SELECT w.id FROM erp_warehouses w WHERE w.branch_id = ANY(erp_user_branch_ids()))
    )
  );

-- --------------------------------------------------------------------------
-- RLS Policies: Price Lists (global or branch-scoped)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "erp_price_lists_select" ON erp_price_lists;
CREATE POLICY "erp_price_lists_select" ON erp_price_lists FOR SELECT
  USING (branch_id IS NULL OR branch_id = ANY(erp_user_branch_ids()));

DROP POLICY IF EXISTS "erp_price_lists_manage" ON erp_price_lists;
CREATE POLICY "erp_price_lists_manage" ON erp_price_lists FOR ALL
  USING (branch_id IS NULL OR branch_id = ANY(erp_user_branch_ids()));

-- Price list items: via parent price list
DROP POLICY IF EXISTS "erp_price_list_items_select" ON erp_price_list_items;
CREATE POLICY "erp_price_list_items_select" ON erp_price_list_items FOR SELECT
  USING (
    price_list_id IN (
      SELECT pl.id FROM erp_price_lists pl
      WHERE pl.branch_id IS NULL OR pl.branch_id = ANY(erp_user_branch_ids())
    )
  );

DROP POLICY IF EXISTS "erp_price_list_items_manage" ON erp_price_list_items;
CREATE POLICY "erp_price_list_items_manage" ON erp_price_list_items FOR ALL
  USING (
    price_list_id IN (
      SELECT pl.id FROM erp_price_lists pl
      WHERE pl.branch_id IS NULL OR pl.branch_id = ANY(erp_user_branch_ids())
    )
  );

-- --------------------------------------------------------------------------
-- RLS Policies: Customers (branch-scoped, or global if no branch)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "erp_customers_select" ON erp_customers;
CREATE POLICY "erp_customers_select" ON erp_customers FOR SELECT
  USING (branch_id IS NULL OR branch_id = ANY(erp_user_branch_ids()));

DROP POLICY IF EXISTS "erp_customers_manage" ON erp_customers;
CREATE POLICY "erp_customers_manage" ON erp_customers FOR ALL
  USING (branch_id IS NULL OR branch_id = ANY(erp_user_branch_ids()));

-- --------------------------------------------------------------------------
-- RLS Policies: Sales Orders (branch-scoped)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "erp_sales_orders_select" ON erp_sales_orders;
CREATE POLICY "erp_sales_orders_select" ON erp_sales_orders FOR SELECT
  USING (branch_id = ANY(erp_user_branch_ids()));

DROP POLICY IF EXISTS "erp_sales_orders_manage" ON erp_sales_orders;
CREATE POLICY "erp_sales_orders_manage" ON erp_sales_orders FOR ALL
  USING (branch_id = ANY(erp_user_branch_ids()));

-- Sales order lines: via parent order
DROP POLICY IF EXISTS "erp_sales_order_lines_select" ON erp_sales_order_lines;
CREATE POLICY "erp_sales_order_lines_select" ON erp_sales_order_lines FOR SELECT
  USING (
    sales_order_id IN (
      SELECT so.id FROM erp_sales_orders so WHERE so.branch_id = ANY(erp_user_branch_ids())
    )
  );

DROP POLICY IF EXISTS "erp_sales_order_lines_manage" ON erp_sales_order_lines;
CREATE POLICY "erp_sales_order_lines_manage" ON erp_sales_order_lines FOR ALL
  USING (
    sales_order_id IN (
      SELECT so.id FROM erp_sales_orders so WHERE so.branch_id = ANY(erp_user_branch_ids())
    )
  );

-- --------------------------------------------------------------------------
-- RLS Policies: Invoices (branch-scoped)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "erp_invoices_select" ON erp_invoices;
CREATE POLICY "erp_invoices_select" ON erp_invoices FOR SELECT
  USING (branch_id = ANY(erp_user_branch_ids()));

DROP POLICY IF EXISTS "erp_invoices_manage" ON erp_invoices;
CREATE POLICY "erp_invoices_manage" ON erp_invoices FOR ALL
  USING (branch_id = ANY(erp_user_branch_ids()));

-- Invoice lines: via parent invoice
DROP POLICY IF EXISTS "erp_invoice_lines_select" ON erp_invoice_lines;
CREATE POLICY "erp_invoice_lines_select" ON erp_invoice_lines FOR SELECT
  USING (
    invoice_id IN (
      SELECT inv.id FROM erp_invoices inv WHERE inv.branch_id = ANY(erp_user_branch_ids())
    )
  );

DROP POLICY IF EXISTS "erp_invoice_lines_manage" ON erp_invoice_lines;
CREATE POLICY "erp_invoice_lines_manage" ON erp_invoice_lines FOR ALL
  USING (
    invoice_id IN (
      SELECT inv.id FROM erp_invoices inv WHERE inv.branch_id = ANY(erp_user_branch_ids())
    )
  );

-- --------------------------------------------------------------------------
-- RLS Policies: Payments (via invoice -> branch)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "erp_payments_select" ON erp_payments;
CREATE POLICY "erp_payments_select" ON erp_payments FOR SELECT
  USING (
    invoice_id IN (
      SELECT inv.id FROM erp_invoices inv WHERE inv.branch_id = ANY(erp_user_branch_ids())
    )
  );

DROP POLICY IF EXISTS "erp_payments_manage" ON erp_payments;
CREATE POLICY "erp_payments_manage" ON erp_payments FOR ALL
  USING (
    invoice_id IN (
      SELECT inv.id FROM erp_invoices inv WHERE inv.branch_id = ANY(erp_user_branch_ids())
    )
  );

-- --------------------------------------------------------------------------
-- RLS Policies: Sales Returns (branch-scoped)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "erp_sales_returns_select" ON erp_sales_returns;
CREATE POLICY "erp_sales_returns_select" ON erp_sales_returns FOR SELECT
  USING (branch_id = ANY(erp_user_branch_ids()));

DROP POLICY IF EXISTS "erp_sales_returns_manage" ON erp_sales_returns;
CREATE POLICY "erp_sales_returns_manage" ON erp_sales_returns FOR ALL
  USING (branch_id = ANY(erp_user_branch_ids()));

-- Sales return lines: via parent return
DROP POLICY IF EXISTS "erp_sales_return_lines_select" ON erp_sales_return_lines;
CREATE POLICY "erp_sales_return_lines_select" ON erp_sales_return_lines FOR SELECT
  USING (
    return_id IN (
      SELECT sr.id FROM erp_sales_returns sr WHERE sr.branch_id = ANY(erp_user_branch_ids())
    )
  );

DROP POLICY IF EXISTS "erp_sales_return_lines_manage" ON erp_sales_return_lines;
CREATE POLICY "erp_sales_return_lines_manage" ON erp_sales_return_lines FOR ALL
  USING (
    return_id IN (
      SELECT sr.id FROM erp_sales_returns sr WHERE sr.branch_id = ANY(erp_user_branch_ids())
    )
  );

-- --------------------------------------------------------------------------
-- RLS Policies: Suppliers (global, all authenticated users)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "erp_suppliers_select" ON erp_suppliers;
CREATE POLICY "erp_suppliers_select" ON erp_suppliers FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "erp_suppliers_manage" ON erp_suppliers;
CREATE POLICY "erp_suppliers_manage" ON erp_suppliers FOR ALL
  USING (auth.uid() IS NOT NULL);

-- --------------------------------------------------------------------------
-- RLS Policies: Purchase Orders (branch-scoped)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "erp_purchase_orders_select" ON erp_purchase_orders;
CREATE POLICY "erp_purchase_orders_select" ON erp_purchase_orders FOR SELECT
  USING (branch_id = ANY(erp_user_branch_ids()));

DROP POLICY IF EXISTS "erp_purchase_orders_manage" ON erp_purchase_orders;
CREATE POLICY "erp_purchase_orders_manage" ON erp_purchase_orders FOR ALL
  USING (branch_id = ANY(erp_user_branch_ids()));

-- PO lines: via parent PO
DROP POLICY IF EXISTS "erp_purchase_order_lines_select" ON erp_purchase_order_lines;
CREATE POLICY "erp_purchase_order_lines_select" ON erp_purchase_order_lines FOR SELECT
  USING (
    purchase_order_id IN (
      SELECT po.id FROM erp_purchase_orders po WHERE po.branch_id = ANY(erp_user_branch_ids())
    )
  );

DROP POLICY IF EXISTS "erp_purchase_order_lines_manage" ON erp_purchase_order_lines;
CREATE POLICY "erp_purchase_order_lines_manage" ON erp_purchase_order_lines FOR ALL
  USING (
    purchase_order_id IN (
      SELECT po.id FROM erp_purchase_orders po WHERE po.branch_id = ANY(erp_user_branch_ids())
    )
  );

-- --------------------------------------------------------------------------
-- RLS Policies: Goods Receipts (via warehouse -> branch)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "erp_goods_receipts_select" ON erp_goods_receipts;
CREATE POLICY "erp_goods_receipts_select" ON erp_goods_receipts FOR SELECT
  USING (
    warehouse_id IN (
      SELECT w.id FROM erp_warehouses w WHERE w.branch_id = ANY(erp_user_branch_ids())
    )
  );

DROP POLICY IF EXISTS "erp_goods_receipts_manage" ON erp_goods_receipts;
CREATE POLICY "erp_goods_receipts_manage" ON erp_goods_receipts FOR ALL
  USING (
    warehouse_id IN (
      SELECT w.id FROM erp_warehouses w WHERE w.branch_id = ANY(erp_user_branch_ids())
    )
  );

-- GR lines: via parent receipt
DROP POLICY IF EXISTS "erp_goods_receipt_lines_select" ON erp_goods_receipt_lines;
CREATE POLICY "erp_goods_receipt_lines_select" ON erp_goods_receipt_lines FOR SELECT
  USING (
    goods_receipt_id IN (
      SELECT gr.id FROM erp_goods_receipts gr
      WHERE gr.warehouse_id IN (SELECT w.id FROM erp_warehouses w WHERE w.branch_id = ANY(erp_user_branch_ids()))
    )
  );

DROP POLICY IF EXISTS "erp_goods_receipt_lines_manage" ON erp_goods_receipt_lines;
CREATE POLICY "erp_goods_receipt_lines_manage" ON erp_goods_receipt_lines FOR ALL
  USING (
    goods_receipt_id IN (
      SELECT gr.id FROM erp_goods_receipts gr
      WHERE gr.warehouse_id IN (SELECT w.id FROM erp_warehouses w WHERE w.branch_id = ANY(erp_user_branch_ids()))
    )
  );

-- --------------------------------------------------------------------------
-- RLS Policies: Supplier Payments (global, all authenticated)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "erp_supplier_payments_select" ON erp_supplier_payments;
CREATE POLICY "erp_supplier_payments_select" ON erp_supplier_payments FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "erp_supplier_payments_manage" ON erp_supplier_payments;
CREATE POLICY "erp_supplier_payments_manage" ON erp_supplier_payments FOR ALL
  USING (auth.uid() IS NOT NULL);

-- --------------------------------------------------------------------------
-- RLS Policies: Chart of Accounts (shared or branch-scoped)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "erp_coa_select" ON erp_chart_of_accounts;
CREATE POLICY "erp_coa_select" ON erp_chart_of_accounts FOR SELECT
  USING (branch_id IS NULL OR branch_id = ANY(erp_user_branch_ids()));

DROP POLICY IF EXISTS "erp_coa_manage" ON erp_chart_of_accounts;
CREATE POLICY "erp_coa_manage" ON erp_chart_of_accounts FOR ALL
  USING (branch_id IS NULL OR branch_id = ANY(erp_user_branch_ids()));

-- --------------------------------------------------------------------------
-- RLS Policies: Fiscal Periods (shared or branch-scoped)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "erp_fiscal_periods_select" ON erp_fiscal_periods;
CREATE POLICY "erp_fiscal_periods_select" ON erp_fiscal_periods FOR SELECT
  USING (branch_id IS NULL OR branch_id = ANY(erp_user_branch_ids()));

DROP POLICY IF EXISTS "erp_fiscal_periods_manage" ON erp_fiscal_periods;
CREATE POLICY "erp_fiscal_periods_manage" ON erp_fiscal_periods FOR ALL
  USING (branch_id IS NULL OR branch_id = ANY(erp_user_branch_ids()));

-- --------------------------------------------------------------------------
-- RLS Policies: Cost Centers (shared or branch-scoped)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "erp_cost_centers_select" ON erp_cost_centers;
CREATE POLICY "erp_cost_centers_select" ON erp_cost_centers FOR SELECT
  USING (branch_id IS NULL OR branch_id = ANY(erp_user_branch_ids()));

DROP POLICY IF EXISTS "erp_cost_centers_manage" ON erp_cost_centers;
CREATE POLICY "erp_cost_centers_manage" ON erp_cost_centers FOR ALL
  USING (branch_id IS NULL OR branch_id = ANY(erp_user_branch_ids()));

-- --------------------------------------------------------------------------
-- RLS Policies: Journal Entries (branch-scoped)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "erp_journal_entries_select" ON erp_journal_entries;
CREATE POLICY "erp_journal_entries_select" ON erp_journal_entries FOR SELECT
  USING (branch_id IS NULL OR branch_id = ANY(erp_user_branch_ids()));

DROP POLICY IF EXISTS "erp_journal_entries_manage" ON erp_journal_entries;
CREATE POLICY "erp_journal_entries_manage" ON erp_journal_entries FOR ALL
  USING (branch_id IS NULL OR branch_id = ANY(erp_user_branch_ids()));

-- Journal lines: via parent entry
DROP POLICY IF EXISTS "erp_journal_lines_select" ON erp_journal_lines;
CREATE POLICY "erp_journal_lines_select" ON erp_journal_lines FOR SELECT
  USING (
    journal_entry_id IN (
      SELECT je.id FROM erp_journal_entries je
      WHERE je.branch_id IS NULL OR je.branch_id = ANY(erp_user_branch_ids())
    )
  );

DROP POLICY IF EXISTS "erp_journal_lines_manage" ON erp_journal_lines;
CREATE POLICY "erp_journal_lines_manage" ON erp_journal_lines FOR ALL
  USING (
    journal_entry_id IN (
      SELECT je.id FROM erp_journal_entries je
      WHERE je.branch_id IS NULL OR je.branch_id = ANY(erp_user_branch_ids())
    )
  );

-- --------------------------------------------------------------------------
-- RLS Policies: Vouchers (branch-scoped)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "erp_payment_vouchers_select" ON erp_payment_vouchers;
CREATE POLICY "erp_payment_vouchers_select" ON erp_payment_vouchers FOR SELECT
  USING (branch_id = ANY(erp_user_branch_ids()));

DROP POLICY IF EXISTS "erp_payment_vouchers_manage" ON erp_payment_vouchers;
CREATE POLICY "erp_payment_vouchers_manage" ON erp_payment_vouchers FOR ALL
  USING (branch_id = ANY(erp_user_branch_ids()));

DROP POLICY IF EXISTS "erp_receipt_vouchers_select" ON erp_receipt_vouchers;
CREATE POLICY "erp_receipt_vouchers_select" ON erp_receipt_vouchers FOR SELECT
  USING (branch_id = ANY(erp_user_branch_ids()));

DROP POLICY IF EXISTS "erp_receipt_vouchers_manage" ON erp_receipt_vouchers;
CREATE POLICY "erp_receipt_vouchers_manage" ON erp_receipt_vouchers FOR ALL
  USING (branch_id = ANY(erp_user_branch_ids()));

-- --------------------------------------------------------------------------
-- RLS Policies: Bank Accounts (branch-scoped)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "erp_bank_accounts_select" ON erp_bank_accounts;
CREATE POLICY "erp_bank_accounts_select" ON erp_bank_accounts FOR SELECT
  USING (branch_id = ANY(erp_user_branch_ids()));

DROP POLICY IF EXISTS "erp_bank_accounts_manage" ON erp_bank_accounts;
CREATE POLICY "erp_bank_accounts_manage" ON erp_bank_accounts FOR ALL
  USING (branch_id = ANY(erp_user_branch_ids()));

-- --------------------------------------------------------------------------
-- RLS Policies: Sequences (branch-scoped)
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "erp_sequences_select" ON erp_sequences;
CREATE POLICY "erp_sequences_select" ON erp_sequences FOR SELECT
  USING (branch_id = ANY(erp_user_branch_ids()));

DROP POLICY IF EXISTS "erp_sequences_manage" ON erp_sequences;
CREATE POLICY "erp_sequences_manage" ON erp_sequences FOR ALL
  USING (branch_id = ANY(erp_user_branch_ids()));

-- ============================================================================
-- 12. SEED DATA: Standard Egyptian Chart of Accounts
-- ============================================================================
-- Uses a standard structure common in Egyptian accounting.
-- All seed accounts are system accounts (is_system = true, branch_id = NULL).
-- The code follows Egyptian Unified Accounting System (UAS) conventions.

INSERT INTO erp_chart_of_accounts (code, name, name_ar, account_type, is_group, is_system, branch_id) VALUES
  -- ─── ASSETS (1xxx) ─────────────────────────────────────────────────
  ('1000', 'Assets',                           'الأصول',                    'asset',     true,  true, NULL),
  ('1100', 'Cash and Cash Equivalents',        'النقدية وما في حكمها',      'asset',     false, true, NULL),
  ('1110', 'Cash on Hand',                     'النقدية بالصندوق',          'asset',     false, true, NULL),
  ('1120', 'Cash at Bank',                     'النقدية بالبنك',            'asset',     false, true, NULL),
  ('1200', 'Accounts Receivable',              'العملاء (المدينون)',         'asset',     false, true, NULL),
  ('1210', 'Notes Receivable',                 'أوراق القبض',              'asset',     false, true, NULL),
  ('1220', 'Employee Receivables',             'سلف وعهد الموظفين',        'asset',     false, true, NULL),
  ('1300', 'Inventory',                        'المخزون',                   'asset',     false, true, NULL),
  ('1310', 'Raw Materials',                    'مواد خام',                  'asset',     false, true, NULL),
  ('1320', 'Finished Goods',                   'بضاعة تامة الصنع',         'asset',     false, true, NULL),
  ('1330', 'Goods in Transit',                 'بضاعة بالطريق',            'asset',     false, true, NULL),
  ('1400', 'Prepaid Expenses',                 'مصروفات مدفوعة مقدماً',    'asset',     false, true, NULL),
  ('1500', 'Fixed Assets',                     'الأصول الثابتة',            'asset',     true,  true, NULL),
  ('1510', 'Land',                             'أراضي',                    'asset',     false, true, NULL),
  ('1520', 'Buildings',                        'مباني',                    'asset',     false, true, NULL),
  ('1530', 'Vehicles',                         'سيارات',                   'asset',     false, true, NULL),
  ('1540', 'Furniture & Equipment',            'أثاث ومعدات',              'asset',     false, true, NULL),
  ('1550', 'Computers & IT Equipment',         'أجهزة حاسب وتقنية',        'asset',     false, true, NULL),
  ('1590', 'Accumulated Depreciation',         'مجمع الإهلاك',             'asset',     false, true, NULL),

  -- ─── LIABILITIES (2xxx) ─────────────────────────────────────────────
  ('2000', 'Liabilities',                      'الالتزامات',               'liability', true,  true, NULL),
  ('2100', 'Accounts Payable',                 'الموردون (الدائنون)',       'liability', false, true, NULL),
  ('2110', 'Notes Payable',                    'أوراق الدفع',              'liability', false, true, NULL),
  ('2200', 'Accrued Expenses',                 'مصروفات مستحقة',           'liability', false, true, NULL),
  ('2300', 'VAT Payable',                      'ضريبة القيمة المضافة',      'liability', false, true, NULL),
  ('2310', 'Withholding Tax Payable',          'ضريبة خصم واضافة',         'liability', false, true, NULL),
  ('2400', 'Social Insurance Payable',         'تأمينات اجتماعية مستحقة',   'liability', false, true, NULL),
  ('2500', 'Short-term Loans',                 'قروض قصيرة الأجل',         'liability', false, true, NULL),
  ('2600', 'Long-term Loans',                  'قروض طويلة الأجل',         'liability', false, true, NULL),
  ('2700', 'Employee Benefits Payable',        'مستحقات الموظفين',          'liability', false, true, NULL),
  ('2800', 'Unearned Revenue',                 'إيرادات مقدمة',            'liability', false, true, NULL),

  -- ─── EQUITY (3xxx) ─────────────────────────────────────────────────
  ('3000', 'Equity',                           'حقوق الملكية',             'equity',    true,  true, NULL),
  ('3100', 'Capital',                          'رأس المال',                'equity',    false, true, NULL),
  ('3200', 'Retained Earnings',                'أرباح مرحلة',              'equity',    false, true, NULL),
  ('3300', 'Reserves',                         'احتياطيات',                'equity',    false, true, NULL),
  ('3310', 'Legal Reserve',                    'احتياطي قانوني',           'equity',    false, true, NULL),
  ('3320', 'General Reserve',                  'احتياطي عام',              'equity',    false, true, NULL),
  ('3400', 'Current Year Profit/Loss',         'أرباح / خسائر العام',       'equity',    false, true, NULL),

  -- ─── REVENUE (4xxx) ─────────────────────────────────────────────────
  ('4000', 'Revenue',                          'الإيرادات',                'revenue',   true,  true, NULL),
  ('4100', 'Sales Revenue',                    'إيرادات المبيعات',          'revenue',   false, true, NULL),
  ('4110', 'Sales Returns',                    'مردودات المبيعات',          'revenue',   false, true, NULL),
  ('4120', 'Sales Discounts',                  'خصم مسموح به',             'revenue',   false, true, NULL),
  ('4200', 'Service Revenue',                  'إيرادات خدمات',            'revenue',   false, true, NULL),
  ('4300', 'Other Revenue',                    'إيرادات أخرى',             'revenue',   false, true, NULL),
  ('4310', 'Interest Income',                  'إيرادات فوائد',            'revenue',   false, true, NULL),
  ('4320', 'Foreign Exchange Gains',           'أرباح فروق عملة',          'revenue',   false, true, NULL),

  -- ─── EXPENSES (5xxx) ─────────────────────────────────────────────────
  ('5000', 'Expenses',                         'المصروفات',                'expense',   true,  true, NULL),
  ('5100', 'Cost of Goods Sold',               'تكلفة البضاعة المباعة',     'expense',   false, true, NULL),
  ('5200', 'Salaries & Wages',                 'مرتبات وأجور',             'expense',   false, true, NULL),
  ('5210', 'Social Insurance Expense',         'تأمينات اجتماعية',          'expense',   false, true, NULL),
  ('5220', 'Employee Benefits',                'مزايا الموظفين',            'expense',   false, true, NULL),
  ('5300', 'Rent Expense',                     'إيجارات',                  'expense',   false, true, NULL),
  ('5310', 'Utilities',                        'كهرباء ومياه وغاز',        'expense',   false, true, NULL),
  ('5320', 'Telecommunications',               'اتصالات',                  'expense',   false, true, NULL),
  ('5400', 'Office Supplies',                  'مستلزمات مكتبية',          'expense',   false, true, NULL),
  ('5410', 'Printing & Stationery',            'طباعة وأدوات كتابية',       'expense',   false, true, NULL),
  ('5500', 'Transportation',                   'انتقالات ومواصلات',         'expense',   false, true, NULL),
  ('5510', 'Vehicle Expenses',                 'مصروفات سيارات',           'expense',   false, true, NULL),
  ('5600', 'Depreciation Expense',             'إهلاكات',                  'expense',   false, true, NULL),
  ('5700', 'Marketing & Advertising',          'تسويق وإعلان',             'expense',   false, true, NULL),
  ('5800', 'Professional Fees',                'أتعاب مهنية',              'expense',   false, true, NULL),
  ('5810', 'Legal Fees',                       'أتعاب قانونية',            'expense',   false, true, NULL),
  ('5820', 'Audit Fees',                       'أتعاب مراجعة',             'expense',   false, true, NULL),
  ('5900', 'Bank Charges',                     'مصروفات بنكية',            'expense',   false, true, NULL),
  ('5910', 'Interest Expense',                 'مصروفات فوائد',            'expense',   false, true, NULL),
  ('5920', 'Foreign Exchange Losses',          'خسائر فروق عملة',          'expense',   false, true, NULL),
  ('5990', 'Other Expenses',                   'مصروفات أخرى',             'expense',   false, true, NULL)
ON CONFLICT DO NOTHING;

-- Set parent_id references for chart of accounts hierarchy
DO $$
DECLARE
  v_assets_id UUID;
  v_liabilities_id UUID;
  v_equity_id UUID;
  v_revenue_id UUID;
  v_expenses_id UUID;
  v_fixed_assets_id UUID;
BEGIN
  SELECT id INTO v_assets_id FROM erp_chart_of_accounts WHERE code = '1000';
  SELECT id INTO v_liabilities_id FROM erp_chart_of_accounts WHERE code = '2000';
  SELECT id INTO v_equity_id FROM erp_chart_of_accounts WHERE code = '3000';
  SELECT id INTO v_revenue_id FROM erp_chart_of_accounts WHERE code = '4000';
  SELECT id INTO v_expenses_id FROM erp_chart_of_accounts WHERE code = '5000';
  SELECT id INTO v_fixed_assets_id FROM erp_chart_of_accounts WHERE code = '1500';

  -- Asset children
  UPDATE erp_chart_of_accounts SET parent_id = v_assets_id
  WHERE code LIKE '1_00' AND code <> '1000' AND code <> '1500' AND parent_id IS NULL;

  UPDATE erp_chart_of_accounts SET parent_id = v_assets_id
  WHERE code IN ('1100','1200','1300','1400','1500') AND parent_id IS NULL;

  UPDATE erp_chart_of_accounts SET parent_id = v_fixed_assets_id
  WHERE code LIKE '15__' AND code <> '1500' AND parent_id IS NULL;

  -- Detail asset accounts under their groups
  UPDATE erp_chart_of_accounts SET parent_id = (SELECT id FROM erp_chart_of_accounts WHERE code = '1100')
  WHERE code IN ('1110','1120') AND parent_id IS NULL;

  UPDATE erp_chart_of_accounts SET parent_id = (SELECT id FROM erp_chart_of_accounts WHERE code = '1200')
  WHERE code IN ('1210','1220') AND parent_id IS NULL;

  UPDATE erp_chart_of_accounts SET parent_id = (SELECT id FROM erp_chart_of_accounts WHERE code = '1300')
  WHERE code IN ('1310','1320','1330') AND parent_id IS NULL;

  -- Liability children
  UPDATE erp_chart_of_accounts SET parent_id = v_liabilities_id
  WHERE code LIKE '2___' AND code <> '2000' AND parent_id IS NULL;

  -- Equity children
  UPDATE erp_chart_of_accounts SET parent_id = v_equity_id
  WHERE code LIKE '3___' AND code <> '3000' AND parent_id IS NULL;

  UPDATE erp_chart_of_accounts SET parent_id = (SELECT id FROM erp_chart_of_accounts WHERE code = '3300')
  WHERE code IN ('3310','3320') AND parent_id IS NULL;

  -- Revenue children
  UPDATE erp_chart_of_accounts SET parent_id = v_revenue_id
  WHERE code LIKE '4___' AND code <> '4000' AND parent_id IS NULL;

  UPDATE erp_chart_of_accounts SET parent_id = (SELECT id FROM erp_chart_of_accounts WHERE code = '4100')
  WHERE code IN ('4110','4120') AND parent_id IS NULL;

  UPDATE erp_chart_of_accounts SET parent_id = (SELECT id FROM erp_chart_of_accounts WHERE code = '4300')
  WHERE code IN ('4310','4320') AND parent_id IS NULL;

  -- Expense children
  UPDATE erp_chart_of_accounts SET parent_id = v_expenses_id
  WHERE code LIKE '5___' AND code <> '5000' AND parent_id IS NULL;

  UPDATE erp_chart_of_accounts SET parent_id = (SELECT id FROM erp_chart_of_accounts WHERE code = '5200')
  WHERE code IN ('5210','5220') AND parent_id IS NULL;

  UPDATE erp_chart_of_accounts SET parent_id = (SELECT id FROM erp_chart_of_accounts WHERE code = '5300')
  WHERE code IN ('5310','5320') AND parent_id IS NULL;

  UPDATE erp_chart_of_accounts SET parent_id = (SELECT id FROM erp_chart_of_accounts WHERE code = '5400')
  WHERE code IN ('5410') AND parent_id IS NULL;

  UPDATE erp_chart_of_accounts SET parent_id = (SELECT id FROM erp_chart_of_accounts WHERE code = '5500')
  WHERE code IN ('5510') AND parent_id IS NULL;

  UPDATE erp_chart_of_accounts SET parent_id = (SELECT id FROM erp_chart_of_accounts WHERE code = '5800')
  WHERE code IN ('5810','5820') AND parent_id IS NULL;

  UPDATE erp_chart_of_accounts SET parent_id = (SELECT id FROM erp_chart_of_accounts WHERE code = '5900')
  WHERE code IN ('5910','5920') AND parent_id IS NULL;
END $$;

-- ============================================================================
-- 13. DONE
-- ============================================================================
-- Migration complete. Summary:
--   - 35 tables created (erp_ prefixed)
--   - 12 enum types (erp_ prefixed)
--   - 5 business-logic triggers
--   - RLS enabled on all tables with branch-scoped policies
--   - Auto-numbering function (erp_next_number)
--   - Seed data: 65 chart of accounts entries (Egyptian standard)
-- ============================================================================
