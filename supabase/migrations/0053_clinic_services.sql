-- ============================================================================
-- 0053: Clinic services catalogue (named services with preset prices)
-- ----------------------------------------------------------------------------
-- Define services (كشف / استشارة / إجراء …) once with a price; pick one when
-- registering a visit to fill the fee — instead of typing it every time.
-- Tenant-scoped (RLS + company_id trigger). Adds service_id on visits. Safe to
-- re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_clinic_services (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  price      NUMERIC NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE erp_clinic_visits
  ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES erp_clinic_services(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_erp_clinic_services_company ON erp_clinic_services(company_id);

ALTER TABLE erp_clinic_services ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS erp_clinic_services_set_company ON erp_clinic_services;
CREATE TRIGGER erp_clinic_services_set_company BEFORE INSERT ON erp_clinic_services
  FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();

DROP TRIGGER IF EXISTS erp_clinic_services_updated ON erp_clinic_services;
CREATE TRIGGER erp_clinic_services_updated BEFORE UPDATE ON erp_clinic_services
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

DROP POLICY IF EXISTS "erp_clinic_services_tenant" ON erp_clinic_services;
CREATE POLICY "erp_clinic_services_tenant" ON erp_clinic_services FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
