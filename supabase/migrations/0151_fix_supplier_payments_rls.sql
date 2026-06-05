-- ============================================================================
-- 0151: Fix cross-tenant leak on erp_supplier_payments (SECURITY)
-- ----------------------------------------------------------------------------
-- The sole policy was `FOR ALL USING (auth.uid() IS NOT NULL)`, letting ANY
-- authenticated user read AND write every company's supplier payments. The table
-- has no company_id; it is scoped via supplier_id -> erp_suppliers.company_id.
-- Scope it to the caller's company (or the platform owner), mirroring the
-- erp_customers tenant policy. The table is empty at apply time, so no data is
-- affected — this closes the hole before any payment data exists. Reversible.
-- ============================================================================

DROP POLICY IF EXISTS erp_supplier_payments_manage ON erp_supplier_payments;

CREATE POLICY erp_supplier_payments_tenant ON erp_supplier_payments
  FOR ALL
  USING (
    erp_is_platform_owner()
    OR EXISTS (
      SELECT 1 FROM erp_suppliers s
      WHERE s.id = erp_supplier_payments.supplier_id
        AND s.company_id = erp_user_company_id()
    )
  )
  WITH CHECK (
    erp_is_platform_owner()
    OR EXISTS (
      SELECT 1 FROM erp_suppliers s
      WHERE s.id = erp_supplier_payments.supplier_id
        AND s.company_id = erp_user_company_id()
    )
  );

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP POLICY erp_supplier_payments_tenant ON erp_supplier_payments;
-- CREATE POLICY erp_supplier_payments_manage ON erp_supplier_payments
--   FOR ALL USING (auth.uid() IS NOT NULL);
