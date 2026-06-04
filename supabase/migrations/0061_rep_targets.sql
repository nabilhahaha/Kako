-- ============================================================================
-- 0061: Distribution — rep monthly targets & commission
-- ----------------------------------------------------------------------------
-- Field reps already own customers (salesman_id) with visit days, sell/collect
-- via the rep app, and settle daily. This adds monthly sales targets and a
-- commission rate per rep, used by a distribution report to show each rep's
-- sales / collections / achievement / commission. Tenant-scoped. Adds a helper
-- listing the company's field reps. Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_rep_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  month DATE NOT NULL,                       -- first day of the month
  target_amount NUMERIC NOT NULL DEFAULT 0,
  commission_pct NUMERIC NOT NULL DEFAULT 0, -- % of sales
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id, month)
);

CREATE INDEX IF NOT EXISTS idx_erp_rep_targets_company ON erp_rep_targets(company_id);

ALTER TABLE erp_rep_targets ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS erp_rep_targets_set_company ON erp_rep_targets;
CREATE TRIGGER erp_rep_targets_set_company BEFORE INSERT ON erp_rep_targets
  FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();
DROP TRIGGER IF EXISTS erp_rep_targets_updated ON erp_rep_targets;
CREATE TRIGGER erp_rep_targets_updated BEFORE UPDATE ON erp_rep_targets
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

DROP POLICY IF EXISTS "erp_rep_targets_tenant" ON erp_rep_targets;
CREATE POLICY "erp_rep_targets_tenant" ON erp_rep_targets FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- The company's field reps (salesman / driver) for target setting & reports.
CREATE OR REPLACE FUNCTION erp_company_reps()
RETURNS TABLE (id UUID, full_name TEXT, email TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT p.id, p.full_name, p.email
  FROM erp_profiles p
  JOIN erp_user_branches ub ON ub.user_id = p.id
  JOIN erp_branches b ON b.id = ub.branch_id
  WHERE b.company_id = erp_user_company_id()
    AND ub.role IN ('salesman', 'driver')
  ORDER BY p.full_name;
$$;

REVOKE ALL ON FUNCTION erp_company_reps() FROM public;
GRANT EXECUTE ON FUNCTION erp_company_reps() TO authenticated;
