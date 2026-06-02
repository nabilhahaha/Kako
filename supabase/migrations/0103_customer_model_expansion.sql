-- ============================================================================
-- 0103: FMCG hierarchy Slice S3 — Expanded Customer Model
-- ----------------------------------------------------------------------------
-- Adds the decision-3 FMCG/ERP customer attributes to erp_customers. Builds on
-- S1 (erp_regions/erp_areas, 0101) and S2 (roles, 0102). ADDITIVE + idempotent:
-- every column is ADD COLUMN IF NOT EXISTS, nullable, no row-rewriting default,
-- so NO existing customer row changes meaning. No RLS change on erp_customers
-- (inherits its tenant policy). Protected verticals untouched.
--
-- Segment / Classification / Channel are NOT hard-coded platform enums. They are
-- COMPANY-MANAGED master data in erp_customer_lookups (each company creates /
-- edits / disables its own values); the customer carries FK ids into it. The
-- platform seeds default FMCG examples for FMCG business types (wholesale /
-- delivery) and for new companies of those types — every company can then manage
-- its own list. The KINDS (segment/classification/channel) are platform-fixed;
-- the VALUES within each kind are tenant master data.
--
-- Reuse (NOT re-added): tax_number = VAT, external_id = ERP coexistence id,
-- is_active/is_approved = status, branch_id/route_id/salesman_id/credit_limit,
-- and the existing erp_wholesale_customer_tier link = price group.
--
-- S3 = customer FIELDS + their master data only. Hierarchy visibility /
-- RLS-by-ownership = S4.
-- ============================================================================

-- ── Customer master-data lookups (company-managed; one table, kind discriminator)
CREATE TABLE IF NOT EXISTS erp_customer_lookups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('segment', 'classification', 'channel')),
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  name_ar     TEXT,
  sort        INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID,
  updated_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, kind, code)
);
CREATE INDEX IF NOT EXISTS idx_erp_customer_lookups_company ON erp_customer_lookups(company_id);
CREATE INDEX IF NOT EXISTS idx_erp_customer_lookups_kind ON erp_customer_lookups(company_id, kind);

-- RLS + company_id trigger + updated_at (same pattern as erp_regions / 0101).
DO $$
BEGIN
  EXECUTE 'ALTER TABLE erp_customer_lookups ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP TRIGGER IF EXISTS erp_customer_lookups_set_company ON erp_customer_lookups';
  EXECUTE 'CREATE TRIGGER erp_customer_lookups_set_company BEFORE INSERT ON erp_customer_lookups FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()';
  EXECUTE 'DROP TRIGGER IF EXISTS erp_customer_lookups_updated ON erp_customer_lookups';
  EXECUTE 'CREATE TRIGGER erp_customer_lookups_updated BEFORE UPDATE ON erp_customer_lookups FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at()';
  EXECUTE 'DROP POLICY IF EXISTS "erp_customer_lookups_tenant" ON erp_customer_lookups';
  EXECUTE 'CREATE POLICY "erp_customer_lookups_tenant" ON erp_customer_lookups FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id()) WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id())';
END $$;

-- ── Customer columns: segmentation FKs → master data (nullable) ───────────────
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS segment_id        UUID REFERENCES erp_customer_lookups(id) ON DELETE SET NULL;
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS classification_id UUID REFERENCES erp_customer_lookups(id) ON DELETE SET NULL;
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS channel_id        UUID REFERENCES erp_customer_lookups(id) ON DELETE SET NULL;

-- ── Geo links to S1 entities ─────────────────────────────────────────────────
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES erp_regions(id) ON DELETE SET NULL;
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS area_id   UUID REFERENCES erp_areas(id)   ON DELETE SET NULL;

-- ── GPS (visit mapping / route optimization) ─────────────────────────────────
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS latitude  NUMERIC(9,6);
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS longitude NUMERIC(9,6);

-- ── Commercial / contact attributes ──────────────────────────────────────────
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER;  -- AR terms (days)
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS contact_person     TEXT;     -- FMCG ordering contact
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS contact_phone      TEXT;
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS cr_number          TEXT;     -- Commercial Registration (distinct from tax_number = VAT)
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS national_address   TEXT;     -- KSA National Address (short address)

CREATE INDEX IF NOT EXISTS idx_erp_customers_region   ON erp_customers(region_id);
CREATE INDEX IF NOT EXISTS idx_erp_customers_area     ON erp_customers(area_id);
CREATE INDEX IF NOT EXISTS idx_erp_customers_segment  ON erp_customers(segment_id);
CREATE INDEX IF NOT EXISTS idx_erp_customers_channel  ON erp_customers(channel_id);

-- ── Default FMCG master data (company-managed; platform provides examples) ────
-- Seeds the three kinds for one company, idempotently. Companies edit/disable/add
-- afterwards; re-running never overwrites or duplicates (guarded on code).
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
    ('segment',        'retail',       'Retail',            'تجزئة',          10),
    ('segment',        'wholesale',    'Wholesale',         'جملة',           20),
    ('segment',        'key_account',  'Key Account',       'حساب رئيسي',      30),
    ('segment',        'distributor',  'Distributor',       'موزع',           40),
    ('classification', 'a',            'Class A',           'فئة أ',           10),
    ('classification', 'b',            'Class B',           'فئة ب',           20),
    ('classification', 'c',            'Class C',           'فئة ج',           30),
    ('channel',        'traditional',  'Traditional Trade', 'تجارة تقليدية',   10),
    ('channel',        'modern',       'Modern Trade',      'تجارة حديثة',     20),
    ('channel',        'wholesale',    'Wholesale',         'جملة',           30),
    ('channel',        'horeca',       'HoReCa',            'فنادق ومطاعم',    40),
    ('channel',        'ecommerce',    'E-Commerce',        'تجارة إلكترونية', 50)
  ) AS v(kind, code, name, name_ar, sort)
  WHERE NOT EXISTS (
    SELECT 1 FROM erp_customer_lookups e
    WHERE e.company_id = p_company_id AND e.kind = v.kind AND e.code = v.code
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.erp_seed_company_customer_lookups(uuid) FROM anon, authenticated, public;

-- Backfill: seed defaults for existing FMCG-distribution companies (wholesale /
-- delivery) — the field-relevant types, mirroring 0098's field_ops scoping. Other
-- companies start empty and add their own via Settings → Customer Data.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT id FROM erp_companies WHERE business_type IN ('wholesale', 'delivery') LOOP
    PERFORM erp_seed_company_customer_lookups(c.id);
  END LOOP;
END $$;

-- New companies of FMCG types get the defaults on creation (separate trigger;
-- the existing roles/modules seed trigger is left untouched).
CREATE OR REPLACE FUNCTION erp_seed_company_customer_lookups_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.business_type IN ('wholesale', 'delivery') THEN
    PERFORM erp_seed_company_customer_lookups(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS erp_companies_seed_customer_lookups ON erp_companies;
CREATE TRIGGER erp_companies_seed_customer_lookups
  AFTER INSERT ON erp_companies
  FOR EACH ROW EXECUTE FUNCTION erp_seed_company_customer_lookups_trg();

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS erp_companies_seed_customer_lookups ON erp_companies;
-- DROP FUNCTION IF EXISTS erp_seed_company_customer_lookups_trg();
-- DROP FUNCTION IF EXISTS erp_seed_company_customer_lookups(uuid);
-- ALTER TABLE erp_customers
--   DROP COLUMN IF EXISTS national_address, DROP COLUMN IF EXISTS cr_number,
--   DROP COLUMN IF EXISTS contact_phone, DROP COLUMN IF EXISTS contact_person,
--   DROP COLUMN IF EXISTS payment_terms_days, DROP COLUMN IF EXISTS longitude,
--   DROP COLUMN IF EXISTS latitude, DROP COLUMN IF EXISTS area_id,
--   DROP COLUMN IF EXISTS region_id, DROP COLUMN IF EXISTS channel_id,
--   DROP COLUMN IF EXISTS classification_id, DROP COLUMN IF EXISTS segment_id;
-- DROP TABLE IF EXISTS erp_customer_lookups;
