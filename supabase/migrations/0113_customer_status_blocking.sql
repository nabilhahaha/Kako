-- ============================================================================
-- 0113: Customer Status Blocking (FP-CS)
-- ----------------------------------------------------------------------------
-- Enforces customer_status (active/suspended/blocked; inactive = archived) on
-- NEW business activity, while ALWAYS allowing debt + stock recovery:
--   • blocked at create: sales orders, invoices            (BEFORE INSERT triggers)
--   • blocked at assign:  salesman / route (blocked only)  (BEFORE UPDATE trigger)
--   • NEVER blocked: payments/collections, sales returns, statements
-- Adds an optional status reason (company-managed lookup) + change history
-- (who/when), stamped automatically. Additive + idempotent; no data backfill
-- (all rows are 'active' from FP-0). New permission customers.change_status.
-- ============================================================================

-- ── A. status_reason: a fifth company-managed lookup kind (extend FP-0 CHECK) ─
ALTER TABLE erp_customer_lookups DROP CONSTRAINT IF EXISTS erp_customer_lookups_kind_check;
ALTER TABLE erp_customer_lookups
  ADD CONSTRAINT erp_customer_lookups_kind_check
  CHECK (kind IN ('segment', 'classification', 'channel', 'business_type', 'status_reason'));

-- ── B. Reason + change-history columns (additive, nullable) ───────────────────
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS status_reason_id   UUID REFERENCES erp_customer_lookups(id) ON DELETE SET NULL;
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS status_reason_note TEXT;
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS status_changed_at  TIMESTAMPTZ;
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS status_changed_by  UUID;

-- ── C. Status read helper (tenant-guarded) ───────────────────────────────────
CREATE OR REPLACE FUNCTION erp_customer_status(p_customer uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT customer_status FROM erp_customers
   WHERE id = p_customer
     AND (erp_is_platform_owner() OR company_id = erp_user_company_id());
$$;
GRANT EXECUTE ON FUNCTION erp_customer_status(uuid) TO authenticated;

-- ── D. Authoritative new-business gate: reject orders/invoices for a customer
--    that is suspended/blocked/inactive (collections & returns have NO trigger). ─
CREATE OR REPLACE FUNCTION erp_block_if_customer_inactive()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE st text;
BEGIN
  SELECT customer_status INTO st FROM erp_customers WHERE id = NEW.customer_id;
  IF st IN ('suspended', 'blocked', 'inactive') THEN
    RAISE EXCEPTION 'customer % is % — new orders/invoices are blocked (collections remain allowed)', NEW.customer_id, st
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS erp_sales_orders_status_gate ON erp_sales_orders;
CREATE TRIGGER erp_sales_orders_status_gate
  BEFORE INSERT ON erp_sales_orders
  FOR EACH ROW EXECUTE FUNCTION erp_block_if_customer_inactive();

DROP TRIGGER IF EXISTS erp_invoices_status_gate ON erp_invoices;
CREATE TRIGGER erp_invoices_status_gate
  BEFORE INSERT ON erp_invoices
  FOR EACH ROW EXECUTE FUNCTION erp_block_if_customer_inactive();

-- ── E. Blocked customers: no new salesman/route assignment (allow unassigning) ─
CREATE OR REPLACE FUNCTION erp_customers_assignment_gate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.customer_status = 'blocked' THEN
    IF NEW.salesman_id IS NOT NULL AND NEW.salesman_id IS DISTINCT FROM OLD.salesman_id THEN
      RAISE EXCEPTION 'customer is blocked — rep assignment is not allowed' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.route_id IS NOT NULL AND NEW.route_id IS DISTINCT FROM OLD.route_id THEN
      RAISE EXCEPTION 'customer is blocked — route assignment is not allowed' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS erp_customers_assignment_gate ON erp_customers;
CREATE TRIGGER erp_customers_assignment_gate
  BEFORE UPDATE OF salesman_id, route_id ON erp_customers
  FOR EACH ROW EXECUTE FUNCTION erp_customers_assignment_gate();

-- ── F. Stamp who/when on every status change; clear the reason on return to
--    Active. Authoritative regardless of code path. ──────────────────────────
CREATE OR REPLACE FUNCTION erp_customers_status_stamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.customer_status IS DISTINCT FROM OLD.customer_status THEN
    NEW.status_changed_at := now();
    NEW.status_changed_by := auth.uid();
    IF NEW.customer_status = 'active' THEN
      NEW.status_reason_id := NULL;
      NEW.status_reason_note := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS erp_customers_status_stamp ON erp_customers;
CREATE TRIGGER erp_customers_status_stamp
  BEFORE UPDATE OF customer_status ON erp_customers
  FOR EACH ROW EXECUTE FUNCTION erp_customers_status_stamp();

-- ── G. New permission: customers.change_status (suspend/block/activate) ───────
INSERT INTO erp_role_permissions (role_key, permission)
SELECT v.role_key, 'customers.change_status'
FROM (VALUES
  ('admin'), ('manager'), ('branch_manager'), ('sales_director'),
  ('national_sales_manager'), ('regional_manager'), ('area_manager'),
  ('supervisor'), ('accountant')
) AS v(role_key)
WHERE EXISTS (SELECT 1 FROM erp_roles r WHERE r.key = v.role_key)
ON CONFLICT (role_key, permission) DO NOTHING;

-- ── H. Seed status_reason defaults (company-managed; re-define the seed fn to
--    cover all five kinds so new companies get them on creation). ────────────
CREATE OR REPLACE FUNCTION erp_seed_company_customer_lookups(p_company_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO erp_customer_lookups (company_id, kind, code, name, name_ar, sort)
  SELECT p_company_id, v.kind, v.code, v.name, v.name_ar, v.sort
  FROM (VALUES
    ('segment',        'retail',        'Retail',            'تجزئة',           10),
    ('segment',        'wholesale',     'Wholesale',         'جملة',            20),
    ('segment',        'key_account',   'Key Account',       'حساب رئيسي',       30),
    ('segment',        'distributor',   'Distributor',       'موزع',            40),
    ('classification', 'a',             'Class A',           'فئة أ',            10),
    ('classification', 'b',             'Class B',           'فئة ب',            20),
    ('classification', 'c',             'Class C',           'فئة ج',            30),
    ('channel',        'traditional',   'Traditional Trade', 'تجارة تقليدية',    10),
    ('channel',        'modern',        'Modern Trade',      'تجارة حديثة',      20),
    ('channel',        'wholesale',     'Wholesale',         'جملة',            30),
    ('channel',        'horeca',        'HoReCa',            'فنادق ومطاعم',     40),
    ('channel',        'ecommerce',     'E-Commerce',        'تجارة إلكترونية',  50),
    ('business_type',  'retail',        'Retail',            'تجزئة',           10),
    ('business_type',  'wholesale',     'Wholesale',         'جملة',            20),
    ('business_type',  'horeca',        'HORECA',            'فنادق ومطاعم',     30),
    ('business_type',  'key_account',   'Key Account',       'حساب رئيسي',       40),
    ('business_type',  'ecommerce',     'E-Commerce',        'تجارة إلكترونية',  50),
    ('business_type',  'distributor',   'Distributor',       'موزع',            60),
    ('status_reason',  'over_credit_limit',    'Over Credit Limit',    'تجاوز حد الائتمان',  10),
    ('status_reason',  'outstanding_payments', 'Outstanding Payments', 'مديونية متأخرة',     20),
    ('status_reason',  'compliance_issue',     'Compliance Issue',     'مخالفة امتثال',      30),
    ('status_reason',  'legal_hold',           'Legal Hold',           'إيقاف قانوني',       40),
    ('status_reason',  'management_decision',  'Management Decision',   'قرار إداري',         50),
    ('status_reason',  'temporary_suspension', 'Temporary Suspension', 'إيقاف مؤقت',         60)
  ) AS v(kind, code, name, name_ar, sort)
  WHERE NOT EXISTS (
    SELECT 1 FROM erp_customer_lookups e
    WHERE e.company_id = p_company_id AND e.kind = v.kind AND e.code = v.code
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.erp_seed_company_customer_lookups(uuid) FROM anon, authenticated, public;

DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT id FROM erp_companies WHERE business_type IN ('wholesale', 'delivery') LOOP
    PERFORM erp_seed_company_customer_lookups(c.id);
  END LOOP;
END $$;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS erp_sales_orders_status_gate ON erp_sales_orders;
-- DROP TRIGGER IF EXISTS erp_invoices_status_gate ON erp_invoices;
-- DROP TRIGGER IF EXISTS erp_customers_assignment_gate ON erp_customers;
-- DROP TRIGGER IF EXISTS erp_customers_status_stamp ON erp_customers;
-- DROP FUNCTION IF EXISTS erp_block_if_customer_inactive();
-- DROP FUNCTION IF EXISTS erp_customers_assignment_gate();
-- DROP FUNCTION IF EXISTS erp_customers_status_stamp();
-- DROP FUNCTION IF EXISTS erp_customer_status(uuid);
-- DELETE FROM erp_role_permissions WHERE permission = 'customers.change_status';
-- ALTER TABLE erp_customers
--   DROP COLUMN IF EXISTS status_changed_by, DROP COLUMN IF EXISTS status_changed_at,
--   DROP COLUMN IF EXISTS status_reason_note, DROP COLUMN IF EXISTS status_reason_id;
