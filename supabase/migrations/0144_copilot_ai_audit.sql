-- ============================================================================
-- 0144: Copilot AI — audit logging (Ask Copilot prototype, feature-flagged OFF)
-- ----------------------------------------------------------------------------
-- The optional AI layer over the deterministic Help Copilot logs each "Ask"
-- through the SAME company-scoped query log (0135), adding the 'ai_ask' type and
-- two provenance columns (which provider answered, and whether we fell back to
-- the deterministic engine). Stores NO question text and NO sensitive data —
-- only metadata, consistent with 0135. Additive + idempotent.
--
-- NOTE: this migration ships with the AI prototype branch and is required only
-- where the AI feature is enabled. It is NOT part of the invoicing hotfix and
-- must not be applied to production ahead of the rest of the drift remediation.
-- ============================================================================

-- Extend the query_type catalogue to include the AI ask.
ALTER TABLE erp_copilot_queries DROP CONSTRAINT IF EXISTS erp_copilot_queries_query_type_check;
ALTER TABLE erp_copilot_queries ADD CONSTRAINT erp_copilot_queries_query_type_check
  CHECK (query_type IN ('screen_help','why_blocked','next_best_action','training','permission_explain','workflow_status','quick_help','ai_ask'));

-- Provenance for AI answers (nullable, additive — ordinary rows leave them NULL).
ALTER TABLE erp_copilot_queries ADD COLUMN IF NOT EXISTS ai_provider TEXT;
ALTER TABLE erp_copilot_queries ADD COLUMN IF NOT EXISTS ai_fallback BOOLEAN;

-- Dedicated SECDEF logger for AI asks (mirrors erp_log_copilot_query; company-
-- scoped via erp_user_company_id; never stores the question text).
CREATE OR REPLACE FUNCTION erp_log_copilot_ai(
  p_action_key text,
  p_locale text,
  p_provider text,
  p_fallback boolean,
  p_blocked boolean
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_id uuid; v_co uuid := erp_user_company_id();
BEGIN
  IF v_co IS NULL THEN RETURN NULL; END IF;
  INSERT INTO erp_copilot_queries(company_id, user_id, query_type, action_key, blocked, locale, ai_provider, ai_fallback)
  VALUES (v_co, auth.uid(), 'ai_ask', p_action_key, p_blocked, p_locale, p_provider, p_fallback)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_log_copilot_ai(text,text,text,boolean,boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_log_copilot_ai(text,text,text,boolean,boolean) TO authenticated, service_role;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS erp_log_copilot_ai(text,text,text,boolean,boolean);
-- ALTER TABLE erp_copilot_queries DROP COLUMN IF EXISTS ai_fallback;
-- ALTER TABLE erp_copilot_queries DROP COLUMN IF EXISTS ai_provider;
-- ALTER TABLE erp_copilot_queries DROP CONSTRAINT IF EXISTS erp_copilot_queries_query_type_check;
-- ALTER TABLE erp_copilot_queries ADD CONSTRAINT erp_copilot_queries_query_type_check
--   CHECK (query_type IN ('screen_help','why_blocked','next_best_action','training','permission_explain','workflow_status','quick_help'));
