-- ============================================================================
-- 0282 — Platform Contact Model: lightweight contact fields on erp_customers
-- ----------------------------------------------------------------------------
-- erp_customers IS the platform contact model: a FULL business customer (FMCG)
-- uses all the governance fields (CR/VAT/GPS/National Address + approval); a
-- LIGHTWEIGHT contact (pharmacy walk-in, clinic patient, retail/cash POS) uses
-- only name (+ optional phone/notes). No new table — add the lightweight bits:
--   • notes        — free text for quick registrations.
--   • contact_mode — 'full' | 'lightweight' (how the contact was created).
-- Industry-agnostic; the lightweight path is gated by tenant feature flags +
-- role permission, the full path keeps the existing FMCG governance.
-- ============================================================================
ALTER TABLE erp_customers
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS contact_mode text NOT NULL DEFAULT 'full'
    CHECK (contact_mode IN ('full', 'lightweight'));
