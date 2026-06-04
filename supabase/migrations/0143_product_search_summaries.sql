-- ============================================================================
-- 0143: Value Acceleration Wave 1 — Product search + scale-safe summaries
-- ----------------------------------------------------------------------------
-- Read-only helpers tuned for scale:
--   erp_search_products()  — paged, tenant-scoped typeahead over the catalog.
--   erp_sales_summary()    — aggregated invoice KPIs per branch over a window.
--   erp_coverage_summary() — aggregated work-session coverage KPIs.
-- All SECURITY DEFINER + STRICTLY tenant-scoped; the two summaries are also
-- perm-guarded ('report.aggregate.view'). erp_products_catalog carries company_id;
-- erp_invoices / erp_work_sessions are branch-scoped (company via erp_branches).
-- Idempotent (CREATE OR REPLACE).
-- ============================================================================

-- ── erp_search_products: paged tenant-scoped typeahead ───────────────────────
-- ILIKE across code/name/name_ar/barcode/brand; active rows only; never returns
-- other tenants' rows (company_id = erp_user_company_id(), or platform owner).
CREATE OR REPLACE FUNCTION erp_search_products(
  p_q text, p_limit int DEFAULT 20, p_offset int DEFAULT 0
)
RETURNS TABLE (
  id               uuid,
  code             text,
  name             text,
  name_ar          text,
  barcode          text,
  brand            text,
  sell_price       numeric,
  default_sell_uom text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_co    uuid := erp_user_company_id();
  v_owner boolean := erp_is_platform_owner();
  v_like  text := '%' || COALESCE(p_q, '') || '%';
  v_lim   int := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_off   int := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF v_co IS NULL AND NOT v_owner THEN
    RETURN; -- no tenant context ⇒ no rows
  END IF;

  RETURN QUERY
  SELECT p.id, p.code, p.name, p.name_ar, p.barcode, p.brand, p.sell_price, p.default_sell_uom
  FROM erp_products_catalog p
  WHERE p.is_active
    AND (v_owner OR p.company_id = v_co)
    AND (
      COALESCE(p_q, '') = ''
      OR p.code    ILIKE v_like
      OR p.name    ILIKE v_like
      OR p.name_ar ILIKE v_like
      OR p.barcode ILIKE v_like
      OR p.brand   ILIKE v_like
    )
  ORDER BY p.name
  LIMIT v_lim OFFSET v_off;
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_search_products(text, int, int) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_search_products(text, int, int) TO authenticated, service_role;

-- ── erp_sales_summary: invoice KPIs per branch over a window ─────────────────
CREATE OR REPLACE FUNCTION erp_sales_summary(
  p_from date, p_to date, p_branch_id uuid DEFAULT NULL
)
RETURNS TABLE (
  branch_id     uuid,
  net_sales     numeric,
  paid          numeric,
  outstanding   numeric,
  invoice_count int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_co    uuid := erp_user_company_id();
  v_owner boolean := erp_is_platform_owner();
BEGIN
  IF NOT erp_user_has_perm('report.aggregate.view') THEN
    RAISE EXCEPTION 'not authorized: report.aggregate.view' USING errcode = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    i.branch_id,
    COALESCE(SUM(i.net_amount), 0)::numeric,
    COALESCE(SUM(i.paid_amount), 0)::numeric,
    COALESCE(SUM(i.net_amount - i.paid_amount), 0)::numeric,
    COUNT(*)::int
  FROM erp_invoices i
  JOIN erp_branches b ON b.id = i.branch_id
  WHERE (v_owner OR b.company_id = v_co)
    AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
    AND i.created_at::date BETWEEN p_from AND p_to
  GROUP BY i.branch_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_sales_summary(date, date, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_sales_summary(date, date, uuid) TO authenticated, service_role;

-- ── erp_coverage_summary: work-session coverage KPIs over a window ───────────
CREATE OR REPLACE FUNCTION erp_coverage_summary(p_from date, p_to date)
RETURNS TABLE (
  avg_coverage    numeric,
  sessions        int,
  gps_violations  int,
  out_of_route    int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_co    uuid := erp_user_company_id();
  v_owner boolean := erp_is_platform_owner();
BEGIN
  IF NOT erp_user_has_perm('report.aggregate.view') THEN
    RAISE EXCEPTION 'not authorized: report.aggregate.view' USING errcode = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    ROUND(AVG(ws.coverage_pct)::numeric, 2),
    COUNT(*)::int,
    COALESCE(SUM(ws.gps_violation_count), 0)::int,
    COALESCE(SUM(ws.out_of_route_count), 0)::int
  FROM erp_work_sessions ws
  JOIN erp_branches b ON b.id = ws.branch_id
  WHERE (v_owner OR b.company_id = v_co)
    AND ws.work_date BETWEEN p_from AND p_to;
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_coverage_summary(date, date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_coverage_summary(date, date) TO authenticated, service_role;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS erp_coverage_summary(date, date);
-- DROP FUNCTION IF EXISTS erp_sales_summary(date, date, uuid);
-- DROP FUNCTION IF EXISTS erp_search_products(text, int, int);
