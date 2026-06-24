-- ============================================================================
-- 0378: Fix erp_fv_coverage so the Coverage Map shows customers (it showed 0).
--
-- Two bugs:
--  (1) TYPE: 0377 declared allowed_radius_m as `double precision` in RETURNS TABLE, but the
--      column erp_rp_customer_verifications.allowed_radius_m is `integer`. RETURN QUERY checks
--      result types strictly, so EVERY call raised "Returned type integer does not match
--      expected type double precision in column 17" → getFvCoverage errored → UI showed 0.
--      Fix: cast the numeric verification columns (distance_m + allowed_radius_m) to the
--      declared double precision.
--  (2) CAP + ORDER: `ORDER BY (v.id IS NOT NULL)` put visited rows LAST, so with the row cap
--      the (few) visited customers were dropped and no green markers / wrong KPIs appeared.
--      Fix: order by code only and raise the cap (up to 50000) so a company's full active set
--      loads (markers + counters correct). Viewport/bbox loading remains the PR-3 path beyond that.
--
-- CREATE OR REPLACE only — same signature, no data change. Safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION erp_fv_coverage(
  p_from             timestamptz DEFAULT NULL,
  p_to               timestamptz DEFAULT NULL,
  p_salesman         text        DEFAULT NULL,
  p_status           text        DEFAULT NULL,
  p_dataset_id       uuid        DEFAULT NULL,
  p_include_archived boolean     DEFAULT false,
  p_search           text        DEFAULT NULL,
  p_limit            integer     DEFAULT 5000
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
    v.verified_at,
    v.distance_m::double precision,
    v.allowed_radius_m::double precision,
    v.radius_enforced,
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
  ORDER BY c.code NULLS LAST
  LIMIT GREATEST(1, LEAST(coalesce(p_limit, 5000), 50000));
END $$;

REVOKE ALL ON FUNCTION erp_fv_coverage(timestamptz, timestamptz, text, text, uuid, boolean, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION erp_fv_coverage(timestamptz, timestamptz, text, text, uuid, boolean, text, integer) TO authenticated;
