-- ============================================================================
-- 0112: FMCG Customer Hierarchy (FP-0) — first-class Head Office → Branch model
-- ----------------------------------------------------------------------------
-- Makes the customer hierarchy a real business relationship (not just a field-
-- inheritance helper). ADDITIVE + idempotent: every column is ADD COLUMN IF NOT
-- EXISTS with a constant default (no table rewrite), so NO existing customer row
-- changes meaning — existing rows become customer_account_type='independent',
-- customer_status='active', credit_control_enabled=true. No RLS change on
-- erp_customers (inherits its tenant policy).
--
-- Scope (pilot): SINGLE LEVEL (Head Office → its direct branches). The schema is
-- depth-agnostic (self-reference + recursive helpers) so multi-level needs no
-- redesign later; the single-level rule is enforced by a guard trigger only.
--
-- Credit model + consolidated AR/aging/balance are the NEXT slice (FP-0c); this
-- slice ships only the structural backbone + master flags + read helpers.
-- ============================================================================

-- ── business_type: a fourth company-managed lookup kind (master data, like
--    segment/classification/channel). Extend the 0103 kind CHECK. ─────────────
ALTER TABLE erp_customer_lookups DROP CONSTRAINT IF EXISTS erp_customer_lookups_kind_check;
ALTER TABLE erp_customer_lookups
  ADD CONSTRAINT erp_customer_lookups_kind_check
  CHECK (kind IN ('segment', 'classification', 'channel', 'business_type'));

-- ── Hierarchy + master flags on erp_customers (all additive) ─────────────────
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS parent_customer_id    UUID REFERENCES erp_customers(id) ON DELETE SET NULL;
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS customer_account_type TEXT NOT NULL DEFAULT 'independent';
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS business_type_id      UUID REFERENCES erp_customer_lookups(id) ON DELETE SET NULL;
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS is_vat_registered     BOOLEAN;
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS payment_type          TEXT;                          -- 'cash' | 'credit'
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS credit_control_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS customer_status       TEXT NOT NULL DEFAULT 'active'; -- active|inactive|suspended|blocked
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS requires_customer_approval BOOLEAN;                   -- null = inherit company default

-- Enum guards (drop+add = idempotent; all existing rows already hold valid defaults).
ALTER TABLE erp_customers DROP CONSTRAINT IF EXISTS erp_customers_account_type_check;
ALTER TABLE erp_customers ADD CONSTRAINT erp_customers_account_type_check
  CHECK (customer_account_type IN ('head_office', 'branch', 'independent'));
ALTER TABLE erp_customers DROP CONSTRAINT IF EXISTS erp_customers_payment_type_check;
ALTER TABLE erp_customers ADD CONSTRAINT erp_customers_payment_type_check
  CHECK (payment_type IS NULL OR payment_type IN ('cash', 'credit'));
ALTER TABLE erp_customers DROP CONSTRAINT IF EXISTS erp_customers_status_check;
ALTER TABLE erp_customers ADD CONSTRAINT erp_customers_status_check
  CHECK (customer_status IN ('active', 'inactive', 'suspended', 'blocked'));

CREATE INDEX IF NOT EXISTS idx_erp_customers_parent        ON erp_customers(parent_customer_id);
CREATE INDEX IF NOT EXISTS idx_erp_customers_account_type  ON erp_customers(company_id, customer_account_type);
CREATE INDEX IF NOT EXISTS idx_erp_customers_business_type ON erp_customers(business_type_id);

-- ── Guard: same-company parent, no self-reference, single level (pilot) ───────
-- Fires BEFORE the set_company trigger on INSERT, so company_id may not be set
-- yet → COALESCE to the caller's company. Runs as invoker (RLS applies): a
-- cross-company parent simply isn't visible → "parent not found".
CREATE OR REPLACE FUNCTION erp_customers_hierarchy_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_company       uuid := COALESCE(NEW.company_id, erp_user_company_id());
  parent_company  uuid;
  parent_parent   uuid;
  has_children    boolean;
BEGIN
  IF NEW.parent_customer_id IS NOT NULL THEN
    IF NEW.parent_customer_id = NEW.id THEN
      RAISE EXCEPTION 'customer cannot be its own parent';
    END IF;
    SELECT company_id, parent_customer_id
      INTO parent_company, parent_parent
      FROM erp_customers WHERE id = NEW.parent_customer_id;
    IF parent_company IS NULL THEN
      RAISE EXCEPTION 'parent customer not found';
    END IF;
    IF parent_company <> v_company THEN
      RAISE EXCEPTION 'parent customer must belong to the same company';
    END IF;
    -- Single-level (pilot): the parent must itself be a top-level node.
    IF parent_parent IS NOT NULL THEN
      RAISE EXCEPTION 'multi-level customer hierarchy is not enabled';
    END IF;
    -- A node that already has branches cannot itself become a branch.
    SELECT EXISTS (SELECT 1 FROM erp_customers WHERE parent_customer_id = NEW.id)
      INTO has_children;
    IF has_children THEN
      RAISE EXCEPTION 'a head office with branches cannot become a branch';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS erp_customers_hierarchy_guard ON erp_customers;
CREATE TRIGGER erp_customers_hierarchy_guard
  BEFORE INSERT OR UPDATE OF parent_customer_id, customer_account_type ON erp_customers
  FOR EACH ROW EXECUTE FUNCTION erp_customers_hierarchy_guard();

-- ── Reusable hierarchy read helpers (recursive CTE; depth-1 today, depth-N
--    ready). SECURITY DEFINER but tenant-guarded to the caller's company. ─────
CREATE OR REPLACE FUNCTION erp_customer_ancestors(p_id uuid)
RETURNS TABLE(id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH RECURSIVE chain AS (
    SELECT c.id, c.parent_customer_id
      FROM erp_customers c
      WHERE c.id = p_id
        AND (erp_is_platform_owner() OR c.company_id = erp_user_company_id())
    UNION ALL
    SELECT c.id, c.parent_customer_id
      FROM erp_customers c
      JOIN chain ch ON c.id = ch.parent_customer_id
  )
  SELECT id FROM chain;
$$;

CREATE OR REPLACE FUNCTION erp_customer_descendants(p_id uuid)
RETURNS TABLE(id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  WITH RECURSIVE tree AS (
    SELECT c.id
      FROM erp_customers c
      WHERE c.id = p_id
        AND (erp_is_platform_owner() OR c.company_id = erp_user_company_id())
    UNION ALL
    SELECT c.id
      FROM erp_customers c
      JOIN tree t ON c.parent_customer_id = t.id
  )
  SELECT id FROM tree;
$$;

-- The node that owns the credit/consolidation decision today: self when a
-- head_office/independent, else the parent. (FP-0c's credit_model decides
-- whether available-credit is computed at this node or per-branch.)
CREATE OR REPLACE FUNCTION erp_customer_head_office(p_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(c.parent_customer_id, c.id)
    FROM erp_customers c
    WHERE c.id = p_id
      AND (erp_is_platform_owner() OR c.company_id = erp_user_company_id());
$$;

GRANT EXECUTE ON FUNCTION erp_customer_ancestors(uuid)    TO authenticated;
GRANT EXECUTE ON FUNCTION erp_customer_descendants(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION erp_customer_head_office(uuid)  TO authenticated;

-- ── Seed business_type defaults (company-managed; platform provides examples) ─
-- Re-define the 0103 seed fn to also cover business_type, so NEW FMCG companies
-- get it on creation (the AFTER INSERT trigger calls this function). Existing
-- segment/classification/channel rows are untouched (guarded on code).
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
    ('segment',        'retail',       'Retail',            'تجزئة',           10),
    ('segment',        'wholesale',    'Wholesale',         'جملة',            20),
    ('segment',        'key_account',  'Key Account',       'حساب رئيسي',       30),
    ('segment',        'distributor',  'Distributor',       'موزع',            40),
    ('classification', 'a',            'Class A',           'فئة أ',            10),
    ('classification', 'b',            'Class B',           'فئة ب',            20),
    ('classification', 'c',            'Class C',           'فئة ج',            30),
    ('channel',        'traditional',  'Traditional Trade', 'تجارة تقليدية',    10),
    ('channel',        'modern',       'Modern Trade',      'تجارة حديثة',      20),
    ('channel',        'wholesale',    'Wholesale',         'جملة',            30),
    ('channel',        'horeca',       'HoReCa',            'فنادق ومطاعم',     40),
    ('channel',        'ecommerce',    'E-Commerce',        'تجارة إلكترونية',  50),
    ('business_type',  'retail',       'Retail',            'تجزئة',           10),
    ('business_type',  'wholesale',    'Wholesale',         'جملة',            20),
    ('business_type',  'horeca',       'HORECA',            'فنادق ومطاعم',     30),
    ('business_type',  'key_account',  'Key Account',       'حساب رئيسي',       40),
    ('business_type',  'ecommerce',    'E-Commerce',        'تجارة إلكترونية',  50),
    ('business_type',  'distributor',  'Distributor',       'موزع',            60)
  ) AS v(kind, code, name, name_ar, sort)
  WHERE NOT EXISTS (
    SELECT 1 FROM erp_customer_lookups e
    WHERE e.company_id = p_company_id AND e.kind = v.kind AND e.code = v.code
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.erp_seed_company_customer_lookups(uuid) FROM anon, authenticated, public;

-- Backfill business_type defaults for existing FMCG-distribution companies
-- (the same set 0103 seeded). Idempotent.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT id FROM erp_companies WHERE business_type IN ('wholesale', 'delivery') LOOP
    PERFORM erp_seed_company_customer_lookups(c.id);
  END LOOP;
END $$;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS erp_customers_hierarchy_guard ON erp_customers;
-- DROP FUNCTION IF EXISTS erp_customers_hierarchy_guard();
-- DROP FUNCTION IF EXISTS erp_customer_ancestors(uuid);
-- DROP FUNCTION IF EXISTS erp_customer_descendants(uuid);
-- DROP FUNCTION IF EXISTS erp_customer_head_office(uuid);
-- ALTER TABLE erp_customers
--   DROP COLUMN IF EXISTS requires_customer_approval, DROP COLUMN IF EXISTS customer_status,
--   DROP COLUMN IF EXISTS credit_control_enabled, DROP COLUMN IF EXISTS payment_type,
--   DROP COLUMN IF EXISTS is_vat_registered, DROP COLUMN IF EXISTS business_type_id,
--   DROP COLUMN IF EXISTS customer_account_type, DROP COLUMN IF EXISTS parent_customer_id;
