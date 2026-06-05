-- ============================================================================
-- 0160: Wrap auth.uid() in the erp_copilot_queries insert policy (initplan)
-- ----------------------------------------------------------------------------
-- The CI schema-health guard found one remaining per-row auth.uid() — on
-- erp_copilot_queries_insert (migration 0135, not yet applied to production).
-- Wrap auth.uid() (and erp_user_company_id()) in (SELECT …) so they are
-- evaluated once per statement, not per row. Behaviour-identical. Reversible.
-- ============================================================================
ALTER POLICY erp_copilot_queries_insert ON erp_copilot_queries
  WITH CHECK ((company_id = (SELECT erp_user_company_id())) AND (user_id = (SELECT auth.uid())));
