-- ============================================================================
-- 0140: Value Acceleration Wave 1 — Returns reason catalog + analytics
-- ----------------------------------------------------------------------------
-- A bilingual, per-company catalog of return reasons, a nullable FK from the
-- existing erp_sales_returns (keeping the legacy free-text reason), and a
-- tenant-scoped analytics RPC grouping returns by reason over a date window.
-- Seeds a sensible default set per existing company (idempotent). ADDITIVE only.
--
-- erp_return_reasons gets erp_set_company_id() BEFORE INSERT + erp_set_updated_at()
-- + company-scoped RLS. erp_returns_by_reason() is SECURITY DEFINER, perm-guarded
-- + tenant-scoped. erp_sales_returns is branch-scoped (company via erp_branches).
-- Idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_return_reasons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  label_en    TEXT,
  label_ar    TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);
CREATE INDEX IF NOT EXISTS idx_erp_return_reasons_company ON erp_return_reasons(company_id, is_active);

DO $$
BEGIN
  EXECUTE 'ALTER TABLE erp_return_reasons ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP TRIGGER IF EXISTS erp_return_reasons_set_company ON erp_return_reasons';
  EXECUTE 'CREATE TRIGGER erp_return_reasons_set_company BEFORE INSERT ON erp_return_reasons FOR EACH ROW EXECUTE FUNCTION erp_set_company_id()';
  EXECUTE 'DROP TRIGGER IF EXISTS erp_return_reasons_updated ON erp_return_reasons';
  EXECUTE 'CREATE TRIGGER erp_return_reasons_updated BEFORE UPDATE ON erp_return_reasons FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at()';
  EXECUTE 'DROP POLICY IF EXISTS erp_return_reasons_read ON erp_return_reasons';
  EXECUTE 'CREATE POLICY erp_return_reasons_read ON erp_return_reasons FOR SELECT USING (erp_is_platform_owner() OR company_id = erp_user_company_id())';
  EXECUTE 'DROP POLICY IF EXISTS erp_return_reasons_write ON erp_return_reasons';
  EXECUTE 'CREATE POLICY erp_return_reasons_write ON erp_return_reasons FOR ALL USING (erp_is_platform_owner() OR company_id = erp_user_company_id()) WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id())';
END $$;

-- Link the existing returns to the catalog (keep legacy free-text reason).
ALTER TABLE erp_sales_returns ADD COLUMN IF NOT EXISTS reason_id UUID REFERENCES erp_return_reasons(id) ON DELETE SET NULL;

-- ── Seed default bilingual reasons for every existing company (idempotent) ────
INSERT INTO erp_return_reasons (company_id, code, label_en, label_ar, sort)
SELECT c.id, d.code, d.label_en, d.label_ar, d.sort
FROM erp_companies c
CROSS JOIN (VALUES
  ('damaged',            'Damaged',            'تالف',          1),
  ('expired',            'Expired',            'منتهي الصلاحية', 2),
  ('wrong_item',         'Wrong item',         'صنف خاطئ',       3),
  ('customer_rejection', 'Customer rejection', 'رفض العميل',     4),
  ('overstock',          'Overstock',          'فائض مخزون',     5)
) AS d(code, label_en, label_ar, sort)
ON CONFLICT (company_id, code) DO NOTHING;

-- ── erp_returns_by_reason: grouped returns analytics over a window ───────────
CREATE OR REPLACE FUNCTION erp_returns_by_reason(p_from date, p_to date)
RETURNS TABLE (
  reason_id        uuid,
  reason_label_en  text,
  reason_label_ar  text,
  return_count     int,
  total_value      numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_co uuid := erp_user_company_id();
BEGIN
  IF NOT erp_user_has_perm('reports.view') THEN
    RAISE EXCEPTION 'not authorized: reports.view' USING errcode = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    rr.id,
    rr.label_en,
    rr.label_ar,
    COUNT(sr.id)::int,
    COALESCE(SUM(sr.total_amount), 0)::numeric
  FROM erp_sales_returns sr
  JOIN erp_branches b ON b.id = sr.branch_id
  LEFT JOIN erp_return_reasons rr ON rr.id = sr.reason_id
  WHERE (erp_is_platform_owner() OR b.company_id = v_co)
    AND sr.created_at::date BETWEEN p_from AND p_to
  GROUP BY rr.id, rr.label_en, rr.label_ar
  ORDER BY COALESCE(SUM(sr.total_amount), 0) DESC;
END $$;
REVOKE EXECUTE ON FUNCTION public.erp_returns_by_reason(date, date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.erp_returns_by_reason(date, date) TO authenticated, service_role;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS erp_returns_by_reason(date, date);
-- ALTER TABLE erp_sales_returns DROP COLUMN IF EXISTS reason_id;
-- DROP TABLE IF EXISTS erp_return_reasons;
