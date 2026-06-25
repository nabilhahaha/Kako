-- ============================================================================
-- 0384: Coverage Map — server-side summary + lean points + single detail + facets.
--
-- The Coverage Map shipped EVERY in-scope customer row (≈39k full rows) to the browser to
-- compute the KPI counters and render markers. For a large company that is slow and risks an
-- undercount if the big payload is truncated, and the dense red (pending) markers visually
-- bury the few green (visited) ones. These read-only helpers fix both:
--
--   erp_fv_coverage_summary(filters)  → total / visited / pending / photos counted in SQL
--                                       (correct + instant; no row shipping).
--   erp_fv_coverage_points(filters)   → ONLY {customer_id, lat, lng, visited} for valid-coord
--                                       in-scope customers, ordered pending→visited so green
--                                       draws on top. Lean payload (no text / photo arrays).
--   erp_fv_coverage_detail(id, range) → the single full row for the tapped marker (panel).
--   erp_fv_coverage_facets()          → rep + active-dataset option lists for the filters.
--
-- Same SECURITY DEFINER auth + company scope + filter semantics as erp_fv_coverage (0377/0378):
-- platform/super/company-admin/field_verification.reports; company-scoped; no RLS change, no
-- write path, no Field Verification behaviour change. CREATE OR REPLACE only; safe to re-run.
-- ============================================================================

-- 1) Summary counters (respects every filter, including p_status) ---------------
CREATE OR REPLACE FUNCTION erp_fv_coverage_summary(
  p_from             timestamptz DEFAULT NULL,
  p_to               timestamptz DEFAULT NULL,
  p_salesman         text        DEFAULT NULL,
  p_status           text        DEFAULT NULL,
  p_dataset_id       uuid        DEFAULT NULL,
  p_include_archived boolean     DEFAULT false,
  p_search           text        DEFAULT NULL
)
RETURNS TABLE (total bigint, visited bigint, pending bigint, photos bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_company uuid := erp_user_company_id();
BEGIN
  IF NOT (erp_is_platform_owner() OR erp_is_super_admin()
          OR (v_company IS NOT NULL AND (
                erp_is_company_admin(v_company)
                OR erp_user_has_permission(v_company, 'field_verification.reports')))) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT
    count(*)::bigint AS total,
    count(*) FILTER (WHERE v.id IS NOT NULL)::bigint AS visited,
    count(*) FILTER (WHERE v.id IS NULL)::bigint     AS pending,
    count(*) FILTER (WHERE v.outside_photo IS NOT NULL OR coalesce(cardinality(v.inside_photos), 0) > 0)::bigint AS photos
  FROM erp_rp_dataset_customers c
  JOIN erp_rp_datasets d ON d.id = c.dataset_id
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
         OR (p_status = 'pending' AND v.id IS NULL));
END $$;

-- 2) Lean marker points (valid coords only; pending first so visited draw on top) -
CREATE OR REPLACE FUNCTION erp_fv_coverage_points(
  p_from             timestamptz DEFAULT NULL,
  p_to               timestamptz DEFAULT NULL,
  p_salesman         text        DEFAULT NULL,
  p_status           text        DEFAULT NULL,
  p_dataset_id       uuid        DEFAULT NULL,
  p_include_archived boolean     DEFAULT false,
  p_search           text        DEFAULT NULL,
  p_limit            integer     DEFAULT 60000
)
RETURNS TABLE (customer_id uuid, lat double precision, lng double precision, visited boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_company uuid := erp_user_company_id();
BEGIN
  IF NOT (erp_is_platform_owner() OR erp_is_super_admin()
          OR (v_company IS NOT NULL AND (
                erp_is_company_admin(v_company)
                OR erp_user_has_permission(v_company, 'field_verification.reports')))) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT c.id, c.lat::double precision, c.lng::double precision, (v.id IS NOT NULL)
  FROM erp_rp_dataset_customers c
  JOIN erp_rp_datasets d ON d.id = c.dataset_id
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
    AND c.lat IS NOT NULL AND c.lng IS NOT NULL AND NOT (c.lat = 0 AND c.lng = 0)
  ORDER BY (v.id IS NOT NULL) DESC       -- visited FIRST so they survive the PostgREST max-rows
                                         -- cap; the map draws green on top via circle-sort-key.
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 60000), 100000));
END $$;

-- 3) Single-customer detail for the panel (same shape as erp_fv_coverage) --------
CREATE OR REPLACE FUNCTION erp_fv_coverage_detail(
  p_customer_id uuid,
  p_from        timestamptz DEFAULT NULL,
  p_to          timestamptz DEFAULT NULL
)
RETURNS TABLE (
  customer_id uuid, code text, name text, city text, area text, channel text,
  salesman text, assigned_rep text, lat double precision, lng double precision,
  dataset_id uuid, dataset_name text, dataset_status text,
  visited boolean, verified_at timestamptz, distance_m double precision,
  allowed_radius_m double precision, radius_enforced boolean,
  outside_photo uuid, inside_photos uuid[], notes text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_company uuid := erp_user_company_id();
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
    p.full_name AS assigned_rep, c.lat, c.lng,
    c.dataset_id, d.name AS dataset_name, d.status AS dataset_status,
    (v.id IS NOT NULL) AS visited, v.verified_at,
    v.distance_m::double precision, v.allowed_radius_m::double precision,
    v.radius_enforced, v.outside_photo, v.inside_photos, v.notes
  FROM erp_rp_dataset_customers c
  JOIN erp_rp_datasets d ON d.id = c.dataset_id
  LEFT JOIN erp_profiles p ON lower(p.email) = lower(c.salesman)
  LEFT JOIN erp_rp_customer_verifications v
         ON v.customer_id = c.id
        AND (p_from IS NULL OR (v.verified_at >= p_from AND v.verified_at <= p_to))
  WHERE c.company_id = v_company AND c.id = p_customer_id
  LIMIT 1;
END $$;

-- 4) Filter facets (reps + active datasets) -------------------------------------
CREATE OR REPLACE FUNCTION erp_fv_coverage_facets()
RETURNS TABLE (kind text, value text, label text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_company uuid := erp_user_company_id();
BEGIN
  IF NOT (erp_is_platform_owner() OR erp_is_super_admin()
          OR (v_company IS NOT NULL AND (
                erp_is_company_admin(v_company)
                OR erp_user_has_permission(v_company, 'field_verification.reports')))) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT 'rep'::text, c.salesman, coalesce(max(p.full_name), c.salesman)
  FROM erp_rp_dataset_customers c
  LEFT JOIN erp_profiles p ON lower(p.email) = lower(c.salesman)
  WHERE c.company_id = v_company AND c.salesman IS NOT NULL AND btrim(c.salesman) <> ''
  GROUP BY c.salesman
  UNION ALL
  SELECT 'dataset'::text, d.id::text, d.name
  FROM erp_rp_datasets d
  WHERE d.company_id = v_company AND d.status <> 'archived';
END $$;

REVOKE ALL ON FUNCTION erp_fv_coverage_summary(timestamptz, timestamptz, text, text, uuid, boolean, text) FROM public;
GRANT EXECUTE ON FUNCTION erp_fv_coverage_summary(timestamptz, timestamptz, text, text, uuid, boolean, text) TO authenticated;
REVOKE ALL ON FUNCTION erp_fv_coverage_points(timestamptz, timestamptz, text, text, uuid, boolean, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION erp_fv_coverage_points(timestamptz, timestamptz, text, text, uuid, boolean, text, integer) TO authenticated;
REVOKE ALL ON FUNCTION erp_fv_coverage_detail(uuid, timestamptz, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION erp_fv_coverage_detail(uuid, timestamptz, timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION erp_fv_coverage_facets() FROM public;
GRANT EXECUTE ON FUNCTION erp_fv_coverage_facets() TO authenticated;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS erp_fv_coverage_summary(timestamptz,timestamptz,text,text,uuid,boolean,text);
-- DROP FUNCTION IF EXISTS erp_fv_coverage_points(timestamptz,timestamptz,text,text,uuid,boolean,text,integer);
-- DROP FUNCTION IF EXISTS erp_fv_coverage_detail(uuid,timestamptz,timestamptz);
-- DROP FUNCTION IF EXISTS erp_fv_coverage_facets();
