-- ============================================================================
-- 0045: Clinic / medical-center module (patients + visits)
-- ----------------------------------------------------------------------------
-- A dedicated vertical for clinics: patients and visits (كشف) with complaint,
-- diagnosis, prescription and a fee — instead of bending the generic invoice/
-- customer screens. Tenant-scoped (RLS + company_id trigger). Adds a
-- 'clinic.manage' permission, the 'clinic' module, and grants. Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_patients (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  branch_id    UUID REFERENCES erp_branches(id) ON DELETE SET NULL,
  code         TEXT,
  name         TEXT NOT NULL,
  phone        TEXT,
  gender       TEXT,
  birth_date   DATE,
  blood_type   TEXT,
  notes        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS erp_clinic_visits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  branch_id     UUID REFERENCES erp_branches(id) ON DELETE SET NULL,
  patient_id    UUID NOT NULL REFERENCES erp_patients(id) ON DELETE CASCADE,
  doctor_id     UUID,
  visit_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  visit_type    TEXT NOT NULL DEFAULT 'consultation',
  complaint     TEXT,
  diagnosis     TEXT,
  prescription  TEXT,
  fee           NUMERIC NOT NULL DEFAULT 0,
  paid_amount   NUMERIC NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'waiting',
  notes         TEXT,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_patients_company ON erp_patients(company_id);
CREATE INDEX IF NOT EXISTS idx_erp_clinic_visits_company ON erp_clinic_visits(company_id);
CREATE INDEX IF NOT EXISTS idx_erp_clinic_visits_patient ON erp_clinic_visits(patient_id);
CREATE INDEX IF NOT EXISTS idx_erp_clinic_visits_date ON erp_clinic_visits(visit_date);

ALTER TABLE erp_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_clinic_visits ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS erp_patients_set_company ON erp_patients;
CREATE TRIGGER erp_patients_set_company BEFORE INSERT ON erp_patients
  FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();
DROP TRIGGER IF EXISTS erp_clinic_visits_set_company ON erp_clinic_visits;
CREATE TRIGGER erp_clinic_visits_set_company BEFORE INSERT ON erp_clinic_visits
  FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();

DROP TRIGGER IF EXISTS erp_patients_updated ON erp_patients;
CREATE TRIGGER erp_patients_updated BEFORE UPDATE ON erp_patients
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();
DROP TRIGGER IF EXISTS erp_clinic_visits_updated ON erp_clinic_visits;
CREATE TRIGGER erp_clinic_visits_updated BEFORE UPDATE ON erp_clinic_visits
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

DROP POLICY IF EXISTS "erp_patients_tenant" ON erp_patients;
CREATE POLICY "erp_patients_tenant" ON erp_patients FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

DROP POLICY IF EXISTS "erp_clinic_visits_tenant" ON erp_clinic_visits;
CREATE POLICY "erp_clinic_visits_tenant" ON erp_clinic_visits FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

INSERT INTO erp_role_permissions (role_key, permission) VALUES
  ('admin','clinic.manage'),('manager','clinic.manage'),
  ('doctor','clinic.manage'),('receptionist','clinic.manage')
ON CONFLICT DO NOTHING;

INSERT INTO erp_business_type_modules (business_type, module) VALUES ('clinic','clinic')
ON CONFLICT (business_type, module) DO NOTHING;
INSERT INTO erp_plan_modules (plan_key, module) SELECT key, 'clinic' FROM erp_plans
ON CONFLICT (plan_key, module) DO NOTHING;
INSERT INTO erp_company_modules (company_id, module, enabled)
SELECT id, 'clinic', true FROM erp_companies WHERE business_type='clinic'
ON CONFLICT (company_id, module) DO NOTHING;
INSERT INTO erp_company_role_permissions (company_id, role_key, permission)
SELECT cr.company_id, cr.role_key, 'clinic.manage'
FROM erp_company_roles cr JOIN erp_companies c ON c.id=cr.company_id
WHERE c.business_type='clinic' AND cr.enabled AND cr.role_key IN ('admin','manager','doctor','receptionist')
ON CONFLICT DO NOTHING;
