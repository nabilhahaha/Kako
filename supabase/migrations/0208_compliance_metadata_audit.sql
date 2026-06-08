-- ============================================================================
-- 0208: Global Tax Compliance — full metadata + audit fields (Phase 5G)
-- ----------------------------------------------------------------------------
-- AUGMENTS the generic submission record (erp_tax_submissions, 0203/0206) with
-- the remaining country-agnostic compliance METADATA + AUDIT columns (Part 1.2 /
-- 1.6): authority references (submission/clearance/reporting/provider), external
-- vs internal invoice numbers, QR reference, submission/response timestamps, and
-- the audit trail (created_by/modified_by/submitted_by + resubmissions). Widens
-- the lifecycle CHECK to add validated / accepted / accepted_with_warning to
-- match src/lib/compliance/lifecycle.ts. Additive + INERT (PAUSED submission).
-- created_by/modified_by/submitted_by follow the erp_invoices convention (uuid,
-- no FK → no covering index needed). Company-scoped RLS already on the table.
-- Depends on 0203, 0206.
-- ============================================================================

ALTER TABLE erp_tax_submissions
  ADD COLUMN IF NOT EXISTS external_invoice_number text,
  ADD COLUMN IF NOT EXISTS internal_invoice_number text,
  ADD COLUMN IF NOT EXISTS qr_reference            text,
  ADD COLUMN IF NOT EXISTS submission_reference    text,
  ADD COLUMN IF NOT EXISTS clearance_reference     text,
  ADD COLUMN IF NOT EXISTS reporting_reference     text,
  ADD COLUMN IF NOT EXISTS provider_reference      text,
  ADD COLUMN IF NOT EXISTS submission_timestamp    timestamptz,
  ADD COLUMN IF NOT EXISTS response_timestamp      timestamptz,
  ADD COLUMN IF NOT EXISTS created_by              uuid,
  ADD COLUMN IF NOT EXISTS modified_by             uuid,
  ADD COLUMN IF NOT EXISTS submitted_by            uuid,
  ADD COLUMN IF NOT EXISTS resubmissions           integer NOT NULL DEFAULT 0;

-- Widen the lifecycle CHECK to the full Phase-5G state set (idempotent).
ALTER TABLE erp_tax_submissions DROP CONSTRAINT IF EXISTS erp_tax_submissions_status_chk;
ALTER TABLE erp_tax_submissions ADD CONSTRAINT erp_tax_submissions_status_chk
  CHECK (status IN ('draft','generated','signed','validated','queued','submitting',
                    'submitted','reported','cleared','accepted','accepted_with_warning',
                    'rejected','failed','dead_lettered','cancelled'));
