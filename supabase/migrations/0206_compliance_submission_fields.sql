-- ============================================================================
-- 0206: E-Invoicing Compliance — submission queue + chain + artifact fields (Phase 5F)
-- ----------------------------------------------------------------------------
-- AUGMENTS the existing generic submission record (erp_tax_submissions, 0203)
-- rather than duplicating it — reuse-first. Adds the reusable foundations:
--   • previous_invoice_hash  — PIH hash-chain link (pairs with invoice_hash)
--   • qr_payload             — Base64 TLV QR (ZATCA Phase-1; reusable)
--   • xml_payload_ref        — storage ref to the generated (UBL) XML
--   • signed_xml_ref         — storage ref to the signed XML (signing PAUSED)
--   • certificate_id         — FK to the certificate store (0205)
--   • compliance_metadata    — our own metadata (distinct from authority_response)
--   • max_attempts / next_attempt_at / dead_lettered_at — retry + dead-letter queue
-- Widens the status CHECK to the full country-agnostic lifecycle (queued /
-- submitting / failed / dead_lettered) matching src/lib/compliance/lifecycle.ts.
-- Additive + INERT; nothing writes these until a connector activates (PAUSED).
-- Company-scoped RLS already on the table. Depends on 0203, 0205.
-- ============================================================================

ALTER TABLE erp_tax_submissions
  ADD COLUMN IF NOT EXISTS previous_invoice_hash text,
  ADD COLUMN IF NOT EXISTS qr_payload            text,
  ADD COLUMN IF NOT EXISTS xml_payload_ref       text,
  ADD COLUMN IF NOT EXISTS signed_xml_ref        text,
  ADD COLUMN IF NOT EXISTS certificate_id        uuid REFERENCES erp_compliance_certificates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS compliance_metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS max_attempts          integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS next_attempt_at       timestamptz,
  ADD COLUMN IF NOT EXISTS dead_lettered_at      timestamptz;

-- Widen the lifecycle CHECK to the full country-agnostic state set (idempotent).
ALTER TABLE erp_tax_submissions DROP CONSTRAINT IF EXISTS erp_tax_submissions_status_check;
ALTER TABLE erp_tax_submissions DROP CONSTRAINT IF EXISTS erp_tax_submissions_status_chk;
ALTER TABLE erp_tax_submissions ADD CONSTRAINT erp_tax_submissions_status_chk
  CHECK (status IN ('draft','generated','signed','queued','submitting','submitted',
                    'cleared','reported','rejected','failed','dead_lettered','cancelled'));

-- FK-covering (schema-health: first index col = FK col) + a due-queue partial index.
CREATE INDEX IF NOT EXISTS idx_tax_submissions_cert ON erp_tax_submissions (certificate_id);
CREATE INDEX IF NOT EXISTS idx_tax_submissions_due  ON erp_tax_submissions (next_attempt_at)
  WHERE next_attempt_at IS NOT NULL;
