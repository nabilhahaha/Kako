-- ============================================================================
-- 0129: FMCG Operations — Route↔Customer membership + Journey Plan engine
-- ----------------------------------------------------------------------------
-- Formalizes the weekly journey plan (which customers a salesman visits on which
-- day, in what sequence, at what frequency). Additive; the legacy
-- erp_customers.visit_day/route_id remain valid and can seed plans.
--
--   erp_route_customers : formal route ↔ customer membership (+ sequence)
--   erp_journey_plans   : per (customer, day_of_week) plan with frequency, sort,
--                         planned time, effective window, status
--   erp_today_journey(salesman, date) : the customers planned for that weekday
--   erp_customer_in_today_plan(...)    : used by GPS check-in compliance (0131)
-- Write is company-scoped (RLS); the granular journey.* permission is enforced at
-- the action layer (matches erp_customers).
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_route_customers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  route_id    UUID NOT NULL REFERENCES erp_routes(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES erp_customers(id) ON DELETE CASCADE,
  sequence    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (route_id, customer_id)
);
CREATE INDEX IF NOT EXISTS idx_erp_route_customers_route ON erp_route_customers(route_id);
CREATE INDEX IF NOT EXISTS idx_erp_route_customers_customer ON erp_route_customers(customer_id);

CREATE TABLE IF NOT EXISTS erp_journey_plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  route_id      UUID REFERENCES erp_routes(id) ON DELETE SET NULL,
  customer_id   UUID NOT NULL REFERENCES erp_customers(id) ON DELETE CASCADE,
  salesman_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  day_of_week   TEXT NOT NULL CHECK (day_of_week IN ('sat','sun','mon','tue','wed','thu','fri')),
  frequency     TEXT NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('weekly','biweekly','monthly')),
  sequence      INTEGER NOT NULL DEFAULT 0,
  planned_time  TIME,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to   DATE,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by    UUID,
  updated_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, customer_id, day_of_week, route_id)
);
CREATE INDEX IF NOT EXISTS idx_erp_journey_plans_salesman_day ON erp_journey_plans(salesman_id, day_of_week) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_erp_journey_plans_customer ON erp_journey_plans(customer_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['erp_route_customers','erp_journey_plans'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_company ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_set_company BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%I_read" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%I_read" ON %I FOR SELECT USING (erp_is_platform_owner() OR company_id = erp_user_company_id())', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%I_write" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%I_write" ON %I FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id()) WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id())', t, t);
  END LOOP;
  EXECUTE 'DROP TRIGGER IF EXISTS erp_journey_plans_updated ON erp_journey_plans';
  EXECUTE 'CREATE TRIGGER erp_journey_plans_updated BEFORE UPDATE ON erp_journey_plans FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at()';
END $$;

-- Map a date to the day-of-week code used by the plan.
CREATE OR REPLACE FUNCTION erp_dow_code(p_date date)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT (ARRAY['sun','mon','tue','wed','thu','fri','sat'])[EXTRACT(DOW FROM p_date)::int + 1];
$$;

-- Today's journey for a salesman: active plan rows for the weekday whose effective
-- window covers the date. Returns customer detail + plan sequence + GPS so the app
-- can apply the chosen sort mode (manual/nearest/optimized/hybrid).
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
  ORDER BY jp.sequence, c.name;
$$;
REVOKE EXECUTE ON FUNCTION public.erp_today_journey(uuid, date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_today_journey(uuid, date) TO authenticated, service_role;

-- Is a customer on the salesman's plan for that date? (GPS / out-of-route checks)
CREATE OR REPLACE FUNCTION erp_customer_in_today_plan(p_salesman uuid, p_customer uuid, p_date date)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM erp_journey_plans jp
    WHERE jp.salesman_id = p_salesman AND jp.customer_id = p_customer
      AND jp.status = 'active' AND jp.day_of_week = erp_dow_code(p_date)
      AND jp.effective_from <= p_date AND (jp.effective_to IS NULL OR jp.effective_to >= p_date)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.erp_customer_in_today_plan(uuid, uuid, date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_customer_in_today_plan(uuid, uuid, date) TO authenticated, service_role;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS erp_customer_in_today_plan(uuid,uuid,date);
-- DROP FUNCTION IF EXISTS erp_today_journey(uuid,date);
-- DROP FUNCTION IF EXISTS erp_dow_code(date);
-- DROP TABLE IF EXISTS erp_journey_plans;
-- DROP TABLE IF EXISTS erp_route_customers;
