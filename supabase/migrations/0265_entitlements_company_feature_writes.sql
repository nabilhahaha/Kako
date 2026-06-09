-- ============================================================================
-- 0265: Entitlement Engine — E5: company-admin feature-level writes (capped)
-- ----------------------------------------------------------------------------
-- Adds a company-scoped write policy to the (new, E1) erp_company_entitlements
-- table for FEATURE-level rows only (feature_key IS NOT NULL), and ONLY when the
-- module-level entitlement is enabled for that company — so a Company Admin can
-- configure features within the Platform-Owner allowance but can never enable a
-- module or exceed it. Module-level rows remain platform-owner-only (E1 policy).
--
-- This refines RLS on a NEW table from this engine (additive, flag-inert). It does
-- NOT touch any existing table's RLS or auth behavior. Policies OR together, so the
-- platform-owner write policy is unchanged. Idempotent.
-- ============================================================================

DROP POLICY IF EXISTS erp_company_entitlements_company_features ON erp_company_entitlements;
CREATE POLICY erp_company_entitlements_company_features ON erp_company_entitlements FOR ALL
  USING (
    feature_key IS NOT NULL
    AND company_id = erp_user_company_id()
  )
  WITH CHECK (
    feature_key IS NOT NULL
    AND company_id = erp_user_company_id()
    AND EXISTS (
      SELECT 1 FROM erp_company_entitlements m
      WHERE m.company_id = erp_company_entitlements.company_id
        AND m.module_key = erp_company_entitlements.module_key
        AND m.feature_key IS NULL
        AND m.is_enabled
    )
  );

-- ── Rollback (manual): DROP POLICY IF EXISTS erp_company_entitlements_company_features ON erp_company_entitlements; ──
