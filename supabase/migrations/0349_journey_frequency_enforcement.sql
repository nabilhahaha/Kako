-- CJ-2: enforce visit frequency (weekly/biweekly/monthly) in erp_today_journey.
-- Previously the function matched day-of-week + effective range only, so biweekly
-- and monthly plans appeared every matching day. Now the cadence is anchored to
-- effective_from: weekly always; biweekly = even weeks; monthly = every 4th week.
-- Backward-compatible: weekly (and any unknown frequency) is unchanged.

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
      jp.frequency = 'weekly'
      OR (jp.frequency = 'biweekly' AND (((p_date - jp.effective_from) / 7) % 2) = 0)
      OR (jp.frequency = 'monthly'  AND (((p_date - jp.effective_from) / 7) % 4) = 0)
      OR jp.frequency NOT IN ('weekly', 'biweekly', 'monthly')  -- forward-compatible
    )
  ORDER BY jp.sequence, c.name;
$$;
