-- ============================================================================
-- 0009: Org hierarchy
-- ----------------------------------------------------------------------------
-- Adds a reporting line to branch memberships so reps can roll up to a sales
-- supervisor (and supervisors to a branch manager). NULL = reports to branch
-- management directly. Safe to re-run.
-- ============================================================================

ALTER TABLE erp_user_branches
  ADD COLUMN IF NOT EXISTS reports_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_erp_user_branches_reports_to ON erp_user_branches(reports_to);
