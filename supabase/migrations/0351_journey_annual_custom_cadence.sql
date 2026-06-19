-- ============================================================================
-- 0351: Annual / custom journey cadence (FR-6)
-- ----------------------------------------------------------------------------
-- Extends visit cadence beyond weekly/biweekly/monthly to annual and arbitrary
-- custom cadences (every N weeks/months/years), driven by the canonical FR-1
-- frequency token. ADDITIVE + backward-compatible:
--   * erp_journey_plans.frequency_token is nullable; when NULL the legacy
--     `frequency` enum is used exactly as before (no behaviour change);
--   * the recurrence is expressed as a whole-WEEK interval so it composes with
--     the existing effective_from anchor (weekly=1, biweekly=2, monthly=4,
--     annual=52, custom = everyN × {1|4|52});
--   * unknown/unparseable cadence stays always-due (forward-compatible).
-- No backfill, no RLS change.
-- ============================================================================

ALTER TABLE erp_journey_plans ADD COLUMN IF NOT EXISTS frequency_token TEXT;

-- Whole-week recurrence interval for a frequency token/enum (NULL = unknown ⇒
-- always due). Mirrors weekIntervalFor() in TS. IMMUTABLE / pure.
CREATE OR REPLACE FUNCTION erp_freq_week_interval(p_token text)
RETURNS int
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_token IS NULL THEN NULL
    WHEN lower(p_token) = 'weekly'   THEN 1
    WHEN lower(p_token) = 'biweekly' THEN 2
    WHEN lower(p_token) = 'monthly'  THEN 4
    WHEN lower(p_token) IN ('annual', 'yearly') THEN 52
    WHEN p_token ~ '^week/[0-9]+/[0-9]+$'  THEN (split_part(p_token, '/', 2))::int
    WHEN p_token ~ '^month/[0-9]+/[0-9]+$' THEN (split_part(p_token, '/', 2))::int * 4
    WHEN p_token ~ '^year/[0-9]+/[0-9]+$'  THEN (split_part(p_token, '/', 2))::int * 52
    ELSE NULL
  END;
$$;

-- Today's journey honours the token (annual/custom) over the legacy enum.
CREATE OR REPLACE FUNCTION erp_today_journey(p_salesman uuid, p_date date)
RETURNS TABLE (
  plan_id uuid, customer_id uuid, customer_code text, customer_name text, customer_name_ar text,
  route_id uuid, sequence int, planned_time time, latitude numeric, longitude numeric,
  phone text, address text, gps_radius int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT jp.id, c.id, c.code, c.name, c.name_ar, jp.route_id, jp.sequence, jp.planned_time,
         c.latitude, c.longitude, c.phone, c.address, erp_customer_gps_radius(c.id)
  FROM erp_journey_plans jp
  JOIN erp_customers c ON c.id = jp.customer_id
  WHERE jp.salesman_id = p_salesman
    AND jp.status = 'active'
    AND jp.day_of_week = erp_dow_code(p_date)
    AND jp.effective_from <= p_date
    AND (jp.effective_to IS NULL OR jp.effective_to >= p_date)
    AND (
      -- token (FR-6) authoritative; fall back to the legacy enum; unknown ⇒ due.
      CASE
        WHEN erp_freq_week_interval(COALESCE(jp.frequency_token, jp.frequency)) IS NULL THEN TRUE
        ELSE (((p_date - jp.effective_from) / 7) % erp_freq_week_interval(COALESCE(jp.frequency_token, jp.frequency))) = 0
      END
    )
  ORDER BY jp.sequence, c.name;
$$;
