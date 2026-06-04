-- ============================================================================
-- 0012: Customer rep assignment + visit day (journey plan)
-- ----------------------------------------------------------------------------
-- Lets each customer be assigned to a salesman and a weekly visit day, which
-- powers the journey plan (who visits whom, and when). Safe to re-run.
-- ============================================================================

ALTER TABLE erp_customers
  ADD COLUMN IF NOT EXISTS salesman_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visit_day TEXT; -- sat | sun | mon | tue | wed | thu | fri

CREATE INDEX IF NOT EXISTS idx_erp_customers_salesman ON erp_customers(salesman_id);
CREATE INDEX IF NOT EXISTS idx_erp_customers_visit_day ON erp_customers(visit_day);
