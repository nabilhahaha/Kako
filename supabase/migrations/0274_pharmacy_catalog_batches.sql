-- ============================================================================
-- 0274 — Pharmacy foundation: Global Medicine Catalog + batch/lot/expiry model
-- ----------------------------------------------------------------------------
-- REUSE, don't rebuild:
--  • The Egyptian medicine database already exists as erp_clinic_reference
--    (kind='drug'), populated on demand by importEgyptianDrugs() and already
--    trigram-indexed. We EXTEND it with the richer medicine fields the pharmacy
--    needs (generic/active ingredient/manufacturer/strength/form/barcode/code/
--    aliases) — all nullable, so the clinic stays unaffected.
--  • erp_products_catalog stays the tenant inventory definition (price/min stock/
--    tax/barcode), now linked to the global catalog via medicine_ref_id.
--
-- NEW (the documented B1–B2 gap): erp_product_batches gives batch-level,
-- expiry-dated, tenant-scoped stock — the keystone for FEFO sales, near-expiry
-- alerts, write-offs and batch-aware returns. Plus a FEFO picker and an
-- expiry-risk view. All additive — existing stock logic is untouched.
-- ============================================================================

-- ── Global Medicine Catalog (extend the shared drug reference) ───────────────
ALTER TABLE erp_clinic_reference
  ADD COLUMN IF NOT EXISTS generic_name      text,
  ADD COLUMN IF NOT EXISTS active_ingredient text,
  ADD COLUMN IF NOT EXISTS manufacturer      text,
  ADD COLUMN IF NOT EXISTS strength          text,
  ADD COLUMN IF NOT EXISTS form              text,
  ADD COLUMN IF NOT EXISTS category          text,
  ADD COLUMN IF NOT EXISTS barcode           text,
  ADD COLUMN IF NOT EXISTS internal_code     text,
  ADD COLUMN IF NOT EXISTS aliases           text[];

-- Barcode lookup on the global catalog (partial — most rows have no barcode yet).
CREATE INDEX IF NOT EXISTS idx_clinic_ref_barcode
  ON erp_clinic_reference (barcode) WHERE barcode IS NOT NULL;

-- ── Tenant inventory ↔ global catalog link + fast POS search ─────────────────
ALTER TABLE erp_products_catalog
  ADD COLUMN IF NOT EXISTS medicine_ref_id uuid REFERENCES erp_clinic_reference(id),
  ADD COLUMN IF NOT EXISTS is_medicine boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_medicine_ref
  ON erp_products_catalog (medicine_ref_id) WHERE medicine_ref_id IS NOT NULL;

-- Trigram GIN indexes for instant partial search by Arabic/English name (POS).
CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON erp_products_catalog USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_name_ar_trgm
  ON erp_products_catalog USING gin (name_ar gin_trgm_ops);

-- ── Batch / lot / expiry model (tenant-scoped) ───────────────────────────────
CREATE TABLE IF NOT EXISTS erp_product_batches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  product_id    uuid NOT NULL REFERENCES erp_products_catalog(id) ON DELETE CASCADE,
  warehouse_id  uuid REFERENCES erp_warehouses(id),
  batch_number  text,
  lot_number    text,
  expiry_date   date,
  qty_on_hand   numeric NOT NULL DEFAULT 0,
  cost_price    numeric,
  supplier_id   uuid REFERENCES erp_suppliers(id),
  received_at   timestamptz NOT NULL DEFAULT now(),
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- FEFO ordering + expiry-bucket scans + per-warehouse stock lookups.
CREATE INDEX IF NOT EXISTS idx_batches_fefo
  ON erp_product_batches (company_id, product_id, expiry_date)
  WHERE qty_on_hand > 0;
CREATE INDEX IF NOT EXISTS idx_batches_expiry
  ON erp_product_batches (company_id, expiry_date)
  WHERE qty_on_hand > 0;
CREATE INDEX IF NOT EXISTS idx_batches_warehouse_product
  ON erp_product_batches (warehouse_id, product_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_batches_natural
  ON erp_product_batches (company_id, product_id, warehouse_id, batch_number, expiry_date);

ALTER TABLE erp_product_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_product_batches_tenant ON erp_product_batches;
CREATE POLICY erp_product_batches_tenant ON erp_product_batches
  FOR ALL USING (
    erp_is_platform_owner() OR company_id = erp_user_company_id()
  )
  WITH CHECK (
    erp_is_platform_owner() OR company_id = erp_user_company_id()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON erp_product_batches TO authenticated;
GRANT ALL ON erp_product_batches TO service_role;

-- ── FEFO picker: which batches (earliest-expiry first) fulfil a quantity ─────
CREATE OR REPLACE FUNCTION erp_pick_fefo_batches(
  p_product uuid, p_warehouse uuid, p_qty numeric
)
RETURNS TABLE(batch_id uuid, batch_number text, expiry_date date, take numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_remaining numeric := GREATEST(COALESCE(p_qty,0), 0); r RECORD;
BEGIN
  FOR r IN
    SELECT b.id, b.batch_number, b.expiry_date, b.qty_on_hand
    FROM erp_product_batches b
    WHERE b.product_id = p_product
      AND (p_warehouse IS NULL OR b.warehouse_id = p_warehouse)
      AND b.qty_on_hand > 0
      AND (b.company_id = erp_user_company_id() OR erp_is_platform_owner())
    ORDER BY b.expiry_date ASC NULLS LAST, b.received_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    batch_id := r.id; batch_number := r.batch_number; expiry_date := r.expiry_date;
    take := LEAST(r.qty_on_hand, v_remaining);
    v_remaining := v_remaining - take;
    RETURN NEXT;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION erp_pick_fefo_batches(uuid, uuid, numeric) TO authenticated, service_role;

-- ── Expiry-risk view (expired / ≤30 / ≤60 / ≤90 days), RLS-aware ─────────────
CREATE OR REPLACE VIEW erp_expiry_risk
WITH (security_invoker = true) AS
SELECT
  b.company_id, b.product_id, b.id AS batch_id, b.warehouse_id,
  b.batch_number, b.expiry_date, b.qty_on_hand,
  p.name, p.name_ar, p.code,
  (b.expiry_date - CURRENT_DATE) AS days_to_expiry,
  CASE
    WHEN b.expiry_date IS NULL                       THEN 'none'
    WHEN b.expiry_date <  CURRENT_DATE               THEN 'expired'
    WHEN b.expiry_date <= CURRENT_DATE + 30          THEN 'd30'
    WHEN b.expiry_date <= CURRENT_DATE + 60          THEN 'd60'
    WHEN b.expiry_date <= CURRENT_DATE + 90          THEN 'd90'
    ELSE 'ok'
  END AS bucket
FROM erp_product_batches b
JOIN erp_products_catalog p ON p.id = b.product_id
WHERE b.qty_on_hand > 0;

GRANT SELECT ON erp_expiry_risk TO authenticated, service_role;
