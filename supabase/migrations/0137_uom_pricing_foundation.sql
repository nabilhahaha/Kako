-- ============================================================================
-- 0137: Value Acceleration Wave 1 — Multi-UOM + Pricing foundation
-- ----------------------------------------------------------------------------
-- ADDITIVE only. Extends erp_products_catalog with base/sales/default sell UOM
-- markers, adds a per-product unit-of-measure conversion table (erp_product_uoms,
-- factor = how many BASE units in 1 of that uom) and a flexible price book
-- (erp_prices) with channel/customer/min-qty precedence + effective windows.
-- Resolution helpers:
--   erp_uom_to_base()  — convert a qty in any uom to base units (factor*qty).
--   erp_resolve_price()— most-specific active price (customer > channel > generic,
--                        highest min_qty<=qty), falling back to catalog sell_price
--                        scaled by the uom factor.
-- Every table gets erp_set_company_id() BEFORE INSERT + erp_set_updated_at(),
-- company-scoped RLS read/write. Functions are SECURITY DEFINER, locked down.
-- Idempotent: IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS.
-- ============================================================================

-- ── Products: UOM markers (backfill from existing unit) ───────────────────────
ALTER TABLE erp_products_catalog ADD COLUMN IF NOT EXISTS base_uom TEXT;
ALTER TABLE erp_products_catalog ADD COLUMN IF NOT EXISTS sales_uom TEXT;
ALTER TABLE erp_products_catalog ADD COLUMN IF NOT EXISTS default_sell_uom TEXT;
UPDATE erp_products_catalog
   SET base_uom         = COALESCE(base_uom, unit),
       default_sell_uom = COALESCE(default_sell_uom, unit)
 WHERE base_uom IS NULL;

-- ── Per-product UOM conversions ──────────────────────────────────────────────
-- factor = number of BASE units contained in 1 of this uom. The base uom row
-- carries factor 1. Cases/cartons typically carry factor > 1.
CREATE TABLE IF NOT EXISTS erp_product_uoms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES erp_products_catalog(id) ON DELETE CASCADE,
  uom         TEXT NOT NULL,
  factor      NUMERIC(14,4) NOT NULL DEFAULT 1,
  barcode     TEXT,
  is_case     BOOLEAN NOT NULL DEFAULT false,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, uom)
);
CREATE INDEX IF NOT EXISTS idx_erp_product_uoms_product ON erp_product_uoms(product_id);
CREATE INDEX IF NOT EXISTS idx_erp_product_uoms_company ON erp_product_uoms(company_id);

-- ── Flexible price book ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_prices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  product_id     UUID NOT NULL REFERENCES erp_products_catalog(id) ON DELETE CASCADE,
  uom            TEXT NOT NULL,
  channel_id     UUID,
  customer_id    UUID,
  min_qty        NUMERIC(14,3) NOT NULL DEFAULT 1,
  price          NUMERIC(14,2) NOT NULL,
  currency       TEXT,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to   DATE,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_by     UUID,
  updated_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_prices_lookup ON erp_prices(company_id, product_id, uom, is_active);

DO $$
BEGIN
  EXECUTE 'ALTER TABLE erp_product_uoms ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE erp_prices ENABLE ROW LEVEL SECURITY';

  -- erp_product_uoms
  EXECUTE 'DROP TRIGGER IF EXISTS erp_product_uoms_set_company ON erp_product_uoms';
  EXECUTE 'CREATE TRIGGER erp_product_uoms_set_company BEFORE INSERT ON erp_product_uoms FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()';
  EXECUTE 'DROP TRIGGER IF EXISTS erp_product_uoms_updated ON erp_product_uoms';
  EXECUTE 'CREATE TRIGGER erp_product_uoms_updated BEFORE UPDATE ON erp_product_uoms FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at()';
  EXECUTE 'DROP POLICY IF EXISTS erp_product_uoms_read ON erp_product_uoms';
  EXECUTE 'CREATE POLICY erp_product_uoms_read ON erp_product_uoms FOR SELECT USING (erp_is_platform_owner() OR company_id = erp_user_company_id())';
  EXECUTE 'DROP POLICY IF EXISTS erp_product_uoms_write ON erp_product_uoms';
  EXECUTE 'CREATE POLICY erp_product_uoms_write ON erp_product_uoms FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id()) WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id())';

  -- erp_prices
  EXECUTE 'DROP TRIGGER IF EXISTS erp_prices_set_company ON erp_prices';
  EXECUTE 'CREATE TRIGGER erp_prices_set_company BEFORE INSERT ON erp_prices FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()';
  EXECUTE 'DROP TRIGGER IF EXISTS erp_prices_updated ON erp_prices';
  EXECUTE 'CREATE TRIGGER erp_prices_updated BEFORE UPDATE ON erp_prices FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at()';
  EXECUTE 'DROP POLICY IF EXISTS erp_prices_read ON erp_prices';
  EXECUTE 'CREATE POLICY erp_prices_read ON erp_prices FOR SELECT USING (erp_is_platform_owner() OR company_id = erp_user_company_id())';
  EXECUTE 'DROP POLICY IF EXISTS erp_prices_write ON erp_prices';
  EXECUTE 'CREATE POLICY erp_prices_write ON erp_prices FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id()) WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id())';
END $$;

-- ── erp_uom_to_base: convert qty in p_uom to BASE units ──────────────────────
-- Returns p_qty * factor. Unknown uom (or the base uom) ⇒ factor 1.
CREATE OR REPLACE FUNCTION erp_uom_to_base(p_product_id uuid, p_uom text, p_qty numeric)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(p_qty, 0) * COALESCE(
    (SELECT u.factor FROM erp_product_uoms u
      WHERE u.product_id = p_product_id AND u.uom = p_uom
      LIMIT 1),
    1
  );
$$;
REVOKE EXECUTE ON FUNCTION public.erp_uom_to_base(uuid, text, numeric) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_uom_to_base(uuid, text, numeric) TO authenticated, service_role;

-- ── erp_resolve_price: most-specific active unit price for a uom ─────────────
-- Precedence: customer-specific > channel-specific > generic; then highest
-- min_qty that still satisfies <= p_qty; only active rows whose effective window
-- covers p_date. Fallback: catalog.sell_price * factor(uom) (the per-uom price).
CREATE OR REPLACE FUNCTION erp_resolve_price(
  p_product_id uuid, p_uom text, p_qty numeric,
  p_customer_id uuid, p_channel_id uuid, p_date date
)
RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_date   date := COALESCE(p_date, CURRENT_DATE);
  v_qty    numeric := COALESCE(p_qty, 1);
  v_price  numeric;
  v_factor numeric;
BEGIN
  SELECT pr.price INTO v_price
    FROM erp_prices pr
   WHERE pr.product_id = p_product_id
     AND pr.uom = p_uom
     AND pr.is_active
     AND pr.effective_from <= v_date
     AND (pr.effective_to IS NULL OR pr.effective_to >= v_date)
     AND pr.min_qty <= v_qty
     AND (pr.customer_id IS NULL OR pr.customer_id = p_customer_id)
     AND (pr.channel_id  IS NULL OR pr.channel_id  = p_channel_id)
   ORDER BY
     (pr.customer_id IS NOT NULL AND pr.customer_id = p_customer_id) DESC,
     (pr.channel_id  IS NOT NULL AND pr.channel_id  = p_channel_id)  DESC,
     pr.min_qty DESC
   LIMIT 1;

  IF v_price IS NOT NULL THEN
    RETURN v_price;
  END IF;

  -- Fallback to catalog sell_price scaled by the uom factor.
  v_factor := COALESCE(
    (SELECT u.factor FROM erp_product_uoms u WHERE u.product_id = p_product_id AND u.uom = p_uom LIMIT 1),
    1);
  RETURN COALESCE((SELECT sell_price FROM erp_products_catalog WHERE id = p_product_id), 0) * v_factor;
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_resolve_price(uuid, text, numeric, uuid, uuid, date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_resolve_price(uuid, text, numeric, uuid, uuid, date) TO authenticated, service_role;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS erp_resolve_price(uuid, text, numeric, uuid, uuid, date);
-- DROP FUNCTION IF EXISTS erp_uom_to_base(uuid, text, numeric);
-- DROP TABLE IF EXISTS erp_prices;
-- DROP TABLE IF EXISTS erp_product_uoms;
-- ALTER TABLE erp_products_catalog DROP COLUMN IF EXISTS default_sell_uom,
--   DROP COLUMN IF EXISTS sales_uom, DROP COLUMN IF EXISTS base_uom;
