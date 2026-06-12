-- ============================================================================
-- 0286 — Pharmacy POS offline idempotency
-- ----------------------------------------------------------------------------
-- Offline Pharmacy POS queues sales on-device and replays them when back online.
-- A client-generated idempotency key dedupes the replay so a sale whose server
-- response was lost is NOT charged twice: pharmacyCheckout records the key after
-- a committed sale and, on replay, returns the same invoice instead of creating a
-- new one. Tenant-scoped, RLS, auto company_id. Safe to re-run.
-- ============================================================================
CREATE TABLE IF NOT EXISTS erp_pharmacy_pos_idempotency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  invoice_id UUID,
  invoice_number TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pharm_pos_idem_company_key
  ON erp_pharmacy_pos_idempotency (company_id, idempotency_key);

ALTER TABLE erp_pharmacy_pos_idempotency ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS erp_pharmacy_pos_idempotency_set_company ON erp_pharmacy_pos_idempotency;
CREATE TRIGGER erp_pharmacy_pos_idempotency_set_company
  BEFORE INSERT ON erp_pharmacy_pos_idempotency
  FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();

DROP POLICY IF EXISTS erp_pharmacy_pos_idempotency_tenant ON erp_pharmacy_pos_idempotency;
CREATE POLICY erp_pharmacy_pos_idempotency_tenant ON erp_pharmacy_pos_idempotency
  FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
