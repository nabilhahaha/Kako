-- ============================================================================
-- 0014: Field visits (journey execution)
-- ----------------------------------------------------------------------------
-- Records that a rep visited a customer on a day, optionally linked to the
-- resulting invoice (or marked no-sale). Powers the rep app's "today's plan"
-- and the daily settlement. Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_visits (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id    UUID NOT NULL REFERENCES erp_branches(id) ON DELETE CASCADE,
  customer_id  UUID NOT NULL REFERENCES erp_customers(id) ON DELETE CASCADE,
  salesman_id  UUID,
  visit_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  invoice_id   UUID REFERENCES erp_invoices(id) ON DELETE SET NULL,
  no_sale      BOOLEAN NOT NULL DEFAULT false,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_visits_branch ON erp_visits(branch_id);
CREATE INDEX IF NOT EXISTS idx_erp_visits_customer ON erp_visits(customer_id);
CREATE INDEX IF NOT EXISTS idx_erp_visits_salesman_date ON erp_visits(salesman_id, visit_date);

ALTER TABLE erp_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "erp_visits_all" ON erp_visits;
CREATE POLICY "erp_visits_all" ON erp_visits FOR ALL
  USING (branch_id = ANY(erp_user_branch_ids()));
