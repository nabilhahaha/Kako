-- ============================================================================
-- 0211: Global Tax Compliance — legal & tax profile fields (Phase 5G, Part 2)
-- ----------------------------------------------------------------------------
-- Additive legal/tax-profile columns reused across all country packs (Saudi, UAE,
-- Egypt, Jordan, Bahrain, Qatar, Oman, Kuwait …): company-level on
-- erp_legal_entities and branch-level on erp_branches (national address + legal/
-- tax identifiers). All nullable text — no FK, no CHECK, no RLS change (policies
-- already in place). erp_tax_registrations remains the authoritative multi-
-- registration store; the VAT/tax number columns here are a convenience profile.
-- Additive only. Depends on 0005, 0202.
-- ============================================================================

-- Company legal profile (legal entity level).
ALTER TABLE erp_legal_entities
  ADD COLUMN IF NOT EXISTS legal_name               text,
  ADD COLUMN IF NOT EXISTS trade_name               text,
  ADD COLUMN IF NOT EXISTS commercial_registration  text,
  ADD COLUMN IF NOT EXISTS vat_registration_number  text,
  ADD COLUMN IF NOT EXISTS tax_registration_number  text,
  ADD COLUMN IF NOT EXISTS national_address         text,
  ADD COLUMN IF NOT EXISTS building_number          text,
  ADD COLUMN IF NOT EXISTS street                   text,
  ADD COLUMN IF NOT EXISTS district                 text,
  ADD COLUMN IF NOT EXISTS city                     text,
  ADD COLUMN IF NOT EXISTS province                 text,
  ADD COLUMN IF NOT EXISTS postal_code              text,
  ADD COLUMN IF NOT EXISTS country_code             text,
  ADD COLUMN IF NOT EXISTS industry                 text,
  ADD COLUMN IF NOT EXISTS tax_regime               text;

-- Branch profile (national address + legal/tax identifiers; code/name/address/city exist).
ALTER TABLE erp_branches
  ADD COLUMN IF NOT EXISTS branch_legal_identifier  text,
  ADD COLUMN IF NOT EXISTS branch_tax_identifier    text,
  ADD COLUMN IF NOT EXISTS national_address         text,
  ADD COLUMN IF NOT EXISTS building_number          text,
  ADD COLUMN IF NOT EXISTS street                   text,
  ADD COLUMN IF NOT EXISTS district                 text,
  ADD COLUMN IF NOT EXISTS postal_code              text,
  ADD COLUMN IF NOT EXISTS country_code             text;
