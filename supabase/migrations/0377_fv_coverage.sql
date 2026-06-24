-- ============================================================================
-- 0377: Field Verification — Coverage Map data source (read-only management).
--
-- erp_fv_coverage(...) returns one row per IN-SCOPE customer with its verification status,
-- for the Coverage Map dashboard (Admin / Supervisor / Viewer-Reporter). SECURITY DEFINER so
-- report viewers (who cannot read the full customer table directly) can still see the
-- not-visited universe — but strictly COMPANY-SCOPED and PERMISSION-GATED:
--   allowed = platform/super, company admin, or holder of field_verification.reports.
--
-- Role scope (PR 1): Admin / Viewer-Reporter → company-wide. Supervisor → TEMPORARILY
-- company-wide too (the current safe report-visibility scope), since FV reps are not yet
-- linked to supervisors via erp_user_branches.reports_to; this flips to strict team scope
-- (erp_subordinate_ids over salesman) once reports_to is configured — same activation as 0374.
--
-- Visited semantics: a customer is "visited" when it has a verification whose verified_at is
-- within [p_from, p_to]; when no range is given, any existing verification counts (current
-- coverage). Photo IDs only (no signed URLs — resolved lazily in the UI). Read-only; additive;
-- no table/column/data change. Safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION erp_fv_coverage(
  p_from             timestamptz DEFAULT NULL,
  p_to               timestamptz DEFAULT NULL,
  p_salesman         text        DEFAULT NULL,   -- rep email; NULL = all
  p_status           text        DEFAULT NULL,   -- 'visited' | 'pending' | NULL = all
  p_dataset_id       uuid        DEFAULT NULL,   -- specific list; NULL = all
  p_include_archived boolean     DEFAULT false,
  p_search           text        DEFAULT NULL,   -- code/name/city/channel ILIKE
  p_limit            integer     DEFAULT 5000
)
RETURNS TABLE (
  customer_id     uuid,
  code            text,
  name            text,
  city            text,
  area            text,
  channel         text,
  salesman        text,
  assigned_rep    text,
  lat             double precision,
  lng             double precision,
  dataset_id      uuid,
  dataset_name    text,
  dataset_status  text,
  visited         boolean,
  verified_at     timestamptz,
  distance_m      double precision,
  allowed_radius_m double precision,
  radius_enforced boolean,
  outside_photo   uuid,
  inside_photos   uuid[],
  notes           text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid := erp_user_company_id();
BEGIN
  IF NOT (erp_is_platform_owner() OR erp_is_super_admin()
          OR (v_company IS NOT NULL AND (
                erp_is_company_admin(v_company)
                OR erp_user_has_permission(v_company, 'field_verification.reports')))) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT
    c.id, c.code, c.name, c.city, c.area, c.channel, c.salesman,
    p.full_name AS assigned_rep,
    c.lat, c.lng,
    c.dataset_id, d.name AS dataset_name, d.status AS dataset_status,
    (v.id IS NOT NULL) AS visited,
    v.verified_at, v.distance_m, v.allowed_radius_m, v.radius_enforced,
    v.outside_photo, v.inside_photos, v.notes
  FROM erp_rp_dataset_customers c
  JOIN erp_rp_datasets d ON d.id = c.dataset_id
  LEFT JOIN erp_profiles p ON lower(p.email) = lower(c.salesman)
  LEFT JOIN erp_rp_customer_verifications v
         ON v.customer_id = c.id
        AND (p_from IS NULL OR (v.verified_at >= p_from AND v.verified_at <= p_to))
  WHERE c.company_id = v_company
    AND (p_include_archived OR d.status <> 'archived')
    AND (p_dataset_id IS NULL OR c.dataset_id = p_dataset_id)
    AND (p_salesman   IS NULL OR c.salesman = p_salesman)
    AND (p_search IS NULL OR p_search = '' OR
         c.code ILIKE '%' || p_search || '%' OR c.name ILIKE '%' || p_search || '%' OR
         c.city ILIKE '%' || p_search || '%' OR c.channel ILIKE '%' || p_search || '%')
    AND (p_status IS NULL
         OR (p_status = 'visited' AND v.id IS NOT NULL)
         OR (p_status = 'pending' AND v.id IS NULL))
  ORDER BY (v.id IS NOT NULL), c.code NULLS LAST
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 5000), 20000));
END $$;

REVOKE ALL ON FUNCTION erp_fv_coverage(timestamptz, timestamptz, text, text, uuid, boolean, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION erp_fv_coverage(timestamptz, timestamptz, text, text, uuid, boolean, text, integer) TO authenticated;
