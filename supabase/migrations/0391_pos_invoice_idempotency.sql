-- ============================================================================
-- 0391 — Fast Food POS: offline-sync idempotency key (ADDITIVE).
--
-- Protects official ZATCA invoice numbers from DUPLICATION when an offline sale is synced
-- (or a checkout is retried): each sale carries a client-generated UUID; the server assigns
-- the official sequential invoice number exactly ONCE per (company, client_uuid). A re-submit
-- with the same client_uuid returns the already-issued invoice instead of creating a second
-- one. Additive column + partial unique index only; no data change, no RLS change.
-- ============================================================================

ALTER TABLE erp_pos_invoices ADD COLUMN IF NOT EXISTS client_uuid uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_inv_client_uuid
  ON erp_pos_invoices (company_id, client_uuid) WHERE client_uuid IS NOT NULL;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS uq_pos_inv_client_uuid;
-- ALTER TABLE erp_pos_invoices DROP COLUMN IF EXISTS client_uuid;
