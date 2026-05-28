-- ============================================================================
-- 0016: Rep daily work sessions (بدء/إنهاء اليوم)
-- ----------------------------------------------------------------------------
-- A rep opens a work session at the start of the day; sales and collections
-- require an open session. Ending the day closes it and blocks further
-- movements (except stock-load requests) until a manager reopens it.
-- Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_work_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id    UUID NOT NULL REFERENCES erp_branches(id) ON DELETE CASCADE,
  salesman_id  UUID NOT NULL,
  work_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  status       TEXT NOT NULL DEFAULT 'open', -- open | closed
  opened_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at    TIMESTAMPTZ,
  UNIQUE(salesman_id, work_date)
);
CREATE INDEX IF NOT EXISTS idx_erp_work_sessions_branch ON erp_work_sessions(branch_id);
CREATE INDEX IF NOT EXISTS idx_erp_work_sessions_sm_date ON erp_work_sessions(salesman_id, work_date);

ALTER TABLE erp_work_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "erp_work_sessions_all" ON erp_work_sessions;
CREATE POLICY "erp_work_sessions_all" ON erp_work_sessions FOR ALL
  USING (branch_id = ANY(erp_user_branch_ids()));
