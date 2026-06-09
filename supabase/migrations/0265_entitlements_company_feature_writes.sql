-- ============================================================================
-- 0265: Entitlement Engine — E5: company-admin feature-level writes
-- ----------------------------------------------------------------------------
-- Adds a company-scoped write policy to the (new, E1) erp_company_entitlements
-- table for FEATURE-level rows only (feature_key IS NOT NULL) — so a Company Admin
-- can configure features for their own company. Module-level rows remain
-- platform-owner-only (E1 policy). The "module must be enabled" CAP is enforced in
-- the server action (setFeatureEntitlement → isEntitled) where it is read
-- consistently; the gate only ever consults MODULE-level entitlements, so a stray
-- feature row for a disabled module has no effect.
--
-- Refines RLS on a NEW table from this engine (additive). It does NOT touch any
-- existing table's RLS or auth behavior. Policies OR together, so the
-- platform-owner write policy is unchanged. Idempotent.
-- ============================================================================

DROP POLICY IF EXISTS erp_company_entitlements_company_features ON erp_company_entitlements;
CREATE POLICY erp_company_entitlements_company_features ON erp_company_entitlements FOR ALL
  USING (feature_key IS NOT NULL AND company_id = erp_user_company_id())
  WITH CHECK (feature_key IS NOT NULL AND company_id = erp_user_company_id());

-- ── Rollback (manual): DROP POLICY IF EXISTS erp_company_entitlements_company_features ON erp_company_entitlements; ──
