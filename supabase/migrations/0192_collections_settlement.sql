-- ============================================================================
-- 0192: Distribution Foundation — collection receipts + multi-invoice settlement
-- ----------------------------------------------------------------------------
-- A collection RECEIPT that can settle MULTIPLE outstanding invoices (the FMCG
-- collections gap; legacy erp_payments links one payment to one invoice). The
-- allocation engine (Phase 3 inc.1) decides the per-invoice split; this stores it.
--   * erp_collections             — receipt header (amount, method, on-account)
--   * erp_collection_allocations  — receipt ↔ invoice applied amounts
-- Additive + INERT: parallel to the legacy single-invoice payment path; nothing
-- writes these until KAKO_DISTRIBUTION is on; no change to erp_payments. Branch-
-- scoped RLS mirroring erp_invoices/_sales_orders.
-- Depends on 0005 (erp_branches/_customers/_invoices, erp_user_branch_ids()).
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_collections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id         uuid NOT NULL REFERENCES erp_branches(id) ON DELETE RESTRICT,
  customer_id       uuid NOT NULL REFERENCES erp_customers(id) ON DELETE RESTRICT,
  collection_number text,
  collection_date   date NOT NULL DEFAULT CURRENT_DATE,
  method            text NOT NULL DEFAULT 'cash'
                      CHECK (method IN ('cash','bank_transfer','check','credit_card','mobile_payment')),
  reference_number  text,
  amount            numeric(14,2) NOT NULL,                 -- total received
  applied_amount    numeric(14,2) NOT NULL DEFAULT 0,       -- sum of allocations
  unapplied_amount  numeric(14,2) NOT NULL DEFAULT 0,       -- on-account credit (amount - applied)
  status            text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','settled','cancelled')),
  received_by       uuid,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_collections_branch   ON erp_collections (branch_id);
CREATE INDEX IF NOT EXISTS idx_collections_customer ON erp_collections (customer_id, collection_date);

CREATE TABLE IF NOT EXISTS erp_collection_allocations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id  uuid NOT NULL REFERENCES erp_collections(id) ON DELETE CASCADE,
  invoice_id     uuid NOT NULL REFERENCES erp_invoices(id) ON DELETE RESTRICT,
  applied_amount numeric(14,2) NOT NULL CHECK (applied_amount > 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (collection_id, invoice_id)                        -- one allocation per invoice per receipt
);
CREATE INDEX IF NOT EXISTS idx_collection_allocations_collection ON erp_collection_allocations (collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_allocations_invoice    ON erp_collection_allocations (invoice_id);

-- ── RLS: branch-scoped, mirroring erp_invoices ──────────────────────────────
ALTER TABLE erp_collections            ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_collection_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_collections_select ON erp_collections;
CREATE POLICY erp_collections_select ON erp_collections FOR SELECT
  USING (branch_id = ANY(erp_user_branch_ids()));
DROP POLICY IF EXISTS erp_collections_manage ON erp_collections;
CREATE POLICY erp_collections_manage ON erp_collections FOR ALL
  USING (branch_id = ANY(erp_user_branch_ids()))
  WITH CHECK (branch_id = ANY(erp_user_branch_ids()));

DROP POLICY IF EXISTS erp_collection_allocations_select ON erp_collection_allocations;
CREATE POLICY erp_collection_allocations_select ON erp_collection_allocations FOR SELECT
  USING (collection_id IN (SELECT id FROM erp_collections WHERE branch_id = ANY(erp_user_branch_ids())));
DROP POLICY IF EXISTS erp_collection_allocations_manage ON erp_collection_allocations;
CREATE POLICY erp_collection_allocations_manage ON erp_collection_allocations FOR ALL
  USING (collection_id IN (SELECT id FROM erp_collections WHERE branch_id = ANY(erp_user_branch_ids())))
  WITH CHECK (collection_id IN (SELECT id FROM erp_collections WHERE branch_id = ANY(erp_user_branch_ids())));
