-- ============================================================================
-- 0376: Field Verification — hot-path performance indexes (Performance PR 1).
-- INDEX-ONLY, additive, reversible. No table/column/RLS/data change.
--
-- 1) erp_rp_dataset_customers (company_id, salesman)
--    Serves the hottest rep-flow filter — getMyNearbyCustomers / getMyMapCustomers /
--    the assigned roster all run `.eq('company_id', …).eq('salesman', me)`. Today only
--    a single-column (company_id) index exists (0360), so Postgres filters the whole
--    company's customer set and then scans for the rep. The composite makes it index-served.
--
-- 2) erp_rp_customer_verifications (company_id, rep_id, created_at DESC)
--    Serves the rep's Completed read — getMyCompletedVerifications runs
--    `.eq('company_id', …).eq('rep_id', …).order('created_at', desc).limit(500)`. The
--    existing indexes are (company_id, verified_at DESC) and (rep_id) separately; neither
--    covers this filter+sort. NOTE: the column is created_at (the actual ORDER BY), not
--    verified_at — verified_at-ordered admin reads stay covered by idx_rp_verif_company.
--
-- Safe to re-run.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_rp_dsc_company_salesman
  ON erp_rp_dataset_customers (company_id, salesman);

CREATE INDEX IF NOT EXISTS idx_rp_verif_company_rep_created
  ON erp_rp_customer_verifications (company_id, rep_id, created_at DESC);
