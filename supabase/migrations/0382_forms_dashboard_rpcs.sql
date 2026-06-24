-- ============================================================================
-- 0382: Multi-Form Field Work — Forms Overview + Cross-Form dashboard RPCs (read-only).
--
--   erp_forms_overview() → one row per CUSTOM form (reserved codes excluded) for the caller's
--     company: assigned count, submissions, photos, last submission, active flag.
--   erp_forms_cross(...) → common columns across ALL the company's custom forms for a
--     cross-form dashboard (date / form / rep / search / city filters).
--
-- Both SECURITY DEFINER (scope centralized — the FV report-RLS lesson): report-permission
-- holders (admin / field_verification.reports / forms.reports) see all the company's rows;
-- everyone else sees only their OWN submissions. Numerics cast to double precision (0378
-- lesson). Function-only, no data change, no Field Verification object touched. Safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION erp_forms_overview()
RETURNS TABLE (
  form_id uuid, code text, name_en text, name_ar text, is_active boolean,
  assigned_count integer, submissions integer, photos integer, last_submission timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_company uuid := erp_user_company_id();
BEGIN
  IF NOT (erp_is_platform_owner() OR erp_is_super_admin()
          OR (v_company IS NOT NULL AND (
                erp_is_company_admin(v_company)
                OR erp_user_has_permission(v_company, 'field_verification.reports')
                OR erp_user_has_permission(v_company, 'forms.reports')))) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT
    f.id, f.code, f.name_en, f.name_ar, f.is_active,
    (SELECT count(*)::int FROM erp_form_assignments a WHERE a.form_id = f.id AND a.is_active),
    (SELECT count(*)::int FROM erp_form_responses r WHERE r.form_id = f.id),
    (SELECT coalesce(sum(coalesce(cardinality(r.photo_ids), 0)), 0)::int FROM erp_form_responses r WHERE r.form_id = f.id),
    (SELECT max(r.created_at) FROM erp_form_responses r WHERE r.form_id = f.id)
  FROM erp_forms f
  WHERE f.company_id = v_company
    AND f.code NOT IN ('fv_verification', 'customer_data_update')
  ORDER BY f.created_at DESC;
END $$;

CREATE OR REPLACE FUNCTION erp_forms_cross(
  p_from   timestamptz DEFAULT NULL,
  p_to     timestamptz DEFAULT NULL,
  p_form   uuid        DEFAULT NULL,
  p_rep    text        DEFAULT NULL,
  p_search text        DEFAULT NULL,
  p_city   text        DEFAULT NULL,
  p_limit  integer     DEFAULT 5000
)
RETURNS TABLE (
  response_id uuid, form_id uuid, form_name text, version integer,
  record_id text, record_code text, record_name text, city text,
  created_by uuid, rep_name text, created_at timestamptz, status text,
  gps_lat double precision, gps_lng double precision, photo_count integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid := erp_user_company_id();
  v_can_all boolean;
BEGIN
  v_can_all := erp_is_platform_owner() OR erp_is_super_admin()
            OR (v_company IS NOT NULL AND (
                  erp_is_company_admin(v_company)
                  OR erp_user_has_permission(v_company, 'field_verification.reports')
                  OR erp_user_has_permission(v_company, 'forms.reports')));
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT
    r.id, f.id, coalesce(f.name_en, f.name_ar, f.code) AS form_name, r.version,
    r.record_id, r.record_code, r.record_name, cu.city,
    r.created_by, p.full_name AS rep_name, r.created_at, r.status,
    r.gps_lat::double precision, r.gps_lng::double precision,
    coalesce(cardinality(r.photo_ids), 0)::int AS photo_count
  FROM erp_form_responses r
  JOIN erp_forms f ON f.id = r.form_id AND f.code NOT IN ('fv_verification', 'customer_data_update')
  LEFT JOIN erp_profiles p ON p.id = r.created_by
  LEFT JOIN erp_rp_dataset_customers cu ON cu.id::text = r.record_id AND cu.company_id = v_company
  WHERE r.company_id = v_company
    AND (p_form IS NULL OR r.form_id = p_form)
    AND (p_from IS NULL OR (r.created_at >= p_from AND r.created_at <= p_to))
    AND (p_rep IS NULL OR p_rep = '' OR r.created_by::text = p_rep)
    AND (p_city IS NULL OR p_city = '' OR cu.city ILIKE '%' || p_city || '%')
    AND (p_search IS NULL OR p_search = '' OR
         r.record_code ILIKE '%' || p_search || '%' OR r.record_name ILIKE '%' || p_search || '%')
    AND (v_can_all OR r.created_by = (select auth.uid()))
  ORDER BY r.created_at DESC
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 5000), 20000));
END $$;

REVOKE ALL ON FUNCTION erp_forms_overview() FROM public;
GRANT EXECUTE ON FUNCTION erp_forms_overview() TO authenticated;
REVOKE ALL ON FUNCTION erp_forms_cross(timestamptz, timestamptz, uuid, text, text, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION erp_forms_cross(timestamptz, timestamptz, uuid, text, text, text, integer) TO authenticated;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS erp_forms_overview();
-- DROP FUNCTION IF EXISTS erp_forms_cross(timestamptz, timestamptz, uuid, text, text, text, integer);
