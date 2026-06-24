-- ============================================================================
-- 0381: Multi-Form Field Work — per-form submissions report RPC (read-only).
--
-- erp_form_submissions returns one row per erp_form_responses for a given form, for the
-- Single Form Report. SECURITY DEFINER so the scope is centralized (the lesson from the FV
-- report RLS work): report-permission holders (admin / field_verification.reports /
-- forms.reports) see all the company's rows for the form; everyone else sees only their OWN
-- submissions. Company-scoped; no data change; no Field Verification table touched.
--
-- All numeric columns are CAST to double precision to match the declared RETURNS TABLE types
-- (the 42804 lesson from 0378). Function-only — CREATE OR REPLACE, safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION erp_form_submissions(
  p_form_id uuid,
  p_from    timestamptz DEFAULT NULL,
  p_to      timestamptz DEFAULT NULL,
  p_rep     text        DEFAULT NULL,   -- created_by uuid (as text) filter
  p_search  text        DEFAULT NULL,
  p_limit   integer     DEFAULT 5000
)
RETURNS TABLE (
  id uuid, version integer, record_id text, record_code text, record_name text,
  created_by uuid, rep_name text, created_at timestamptz, status text,
  answers jsonb, gps_lat double precision, gps_lng double precision,
  distance_m double precision, allowed_radius_m double precision,
  radius_enforced boolean, photo_ids uuid[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid := erp_user_company_id();
  v_can_all boolean;
BEGIN
  -- The form must belong to the caller's company.
  IF NOT EXISTS (SELECT 1 FROM erp_forms f WHERE f.id = p_form_id AND f.company_id = v_company) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_can_all := erp_is_platform_owner() OR erp_is_super_admin()
            OR (v_company IS NOT NULL AND (
                  erp_is_company_admin(v_company)
                  OR erp_user_has_permission(v_company, 'field_verification.reports')
                  OR erp_user_has_permission(v_company, 'forms.reports')));

  RETURN QUERY
  SELECT
    r.id, r.version, r.record_id, r.record_code, r.record_name,
    r.created_by, p.full_name AS rep_name, r.created_at, r.status,
    r.answers,
    r.gps_lat::double precision, r.gps_lng::double precision,
    r.distance_m::double precision, r.allowed_radius_m::double precision,
    r.radius_enforced, r.photo_ids
  FROM erp_form_responses r
  LEFT JOIN erp_profiles p ON p.id = r.created_by
  WHERE r.company_id = v_company
    AND r.form_id = p_form_id
    AND (p_from IS NULL OR (r.created_at >= p_from AND r.created_at <= p_to))
    AND (p_rep IS NULL OR p_rep = '' OR r.created_by::text = p_rep)
    AND (p_search IS NULL OR p_search = '' OR
         r.record_code ILIKE '%' || p_search || '%' OR
         r.record_name ILIKE '%' || p_search || '%')
    AND (v_can_all OR r.created_by = (select auth.uid()))
  ORDER BY r.created_at DESC
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 5000), 20000));
END $$;

REVOKE ALL ON FUNCTION erp_form_submissions(uuid, timestamptz, timestamptz, text, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION erp_form_submissions(uuid, timestamptz, timestamptz, text, text, integer) TO authenticated;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS erp_form_submissions(uuid, timestamptz, timestamptz, text, text, integer);
