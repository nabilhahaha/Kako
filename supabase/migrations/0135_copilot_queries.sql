-- ============================================================================
-- 0135: Help Copilot — query log for Confusion Analytics (Feature 16)
-- ----------------------------------------------------------------------------
-- The deterministic Help Copilot logs each question it answers so the Platform
-- Owner / Company Admin can see the most-asked questions, most confusing screens,
-- and most common permission/workflow blockers. Stores NO sensitive data — only
-- the query type, action/screen key, whether it was blocked, and the block-reason
-- codes. Company-scoped (RLS); any member can log their own query; admins/owner
-- read the analytics.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_copilot_queries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  query_type  TEXT NOT NULL CHECK (query_type IN ('screen_help','why_blocked','next_best_action','training','permission_explain','workflow_status','quick_help')),
  action_key  TEXT,
  screen_href TEXT,
  blocked     BOOLEAN,
  reason_codes TEXT[],
  locale      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_erp_copilot_queries_company_date ON erp_copilot_queries(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_erp_copilot_queries_type ON erp_copilot_queries(company_id, query_type);

DO $$
BEGIN
  EXECUTE 'ALTER TABLE erp_copilot_queries ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP TRIGGER IF EXISTS erp_copilot_queries_set_company ON erp_copilot_queries';
  EXECUTE 'CREATE TRIGGER erp_copilot_queries_set_company BEFORE INSERT ON erp_copilot_queries FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()';
  -- Read: company admin or platform owner (the analytics dashboard audience).
  EXECUTE 'DROP POLICY IF EXISTS erp_copilot_queries_read ON erp_copilot_queries';
  EXECUTE 'CREATE POLICY erp_copilot_queries_read ON erp_copilot_queries FOR SELECT USING (erp_is_platform_owner() OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id)))';
  -- Insert: any authenticated member, logging their OWN query for their company.
  EXECUTE 'DROP POLICY IF EXISTS erp_copilot_queries_insert ON erp_copilot_queries';
  EXECUTE 'CREATE POLICY erp_copilot_queries_insert ON erp_copilot_queries FOR INSERT WITH CHECK (company_id = erp_user_company_id() AND user_id = auth.uid())';
END $$;

-- Log helper (SECDEF; lets the copilot log without exposing the table to writes
-- beyond the self-insert policy). Returns the new row id.
CREATE OR REPLACE FUNCTION erp_log_copilot_query(
  p_query_type text, p_action_key text, p_screen_href text,
  p_blocked boolean, p_reason_codes text[], p_locale text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_id uuid; v_co uuid := erp_user_company_id();
BEGIN
  IF v_co IS NULL THEN RETURN NULL; END IF;
  INSERT INTO erp_copilot_queries(company_id, user_id, query_type, action_key, screen_href, blocked, reason_codes, locale)
  VALUES (v_co, auth.uid(), p_query_type, p_action_key, p_screen_href, p_blocked, p_reason_codes, p_locale)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_log_copilot_query(text,text,text,boolean,text[],text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_log_copilot_query(text,text,text,boolean,text[],text) TO authenticated, service_role;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS erp_log_copilot_query(text,text,text,boolean,text[],text);
-- DROP TABLE IF EXISTS erp_copilot_queries;
