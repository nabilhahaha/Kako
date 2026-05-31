-- ============================================================================
-- 0046: Clinic appointments (المواعيد)
-- ----------------------------------------------------------------------------
-- Pre-booked appointments for the clinic vertical: a patient is scheduled for a
-- date/time, then "arrives" and is turned into a visit (كشف). Tenant-scoped
-- (RLS + company_id trigger). Reuses the existing 'clinic.manage' permission.
-- Also links a visit back to the appointment it originated from. Safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_clinic_appointments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES erp_companies(id) ON DELETE CASCADE,
  branch_id     UUID REFERENCES erp_branches(id) ON DELETE SET NULL,
  patient_id    UUID NOT NULL REFERENCES erp_patients(id) ON DELETE CASCADE,
  doctor_id     UUID,
  scheduled_at  TIMESTAMPTZ NOT NULL,
  duration_min  INTEGER NOT NULL DEFAULT 30,
  reason        TEXT,
  status        TEXT NOT NULL DEFAULT 'scheduled',
  notes         TEXT,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Link a visit to the appointment it was created from (when applicable).
ALTER TABLE erp_clinic_visits
  ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES erp_clinic_appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_erp_clinic_appts_company ON erp_clinic_appointments(company_id);
CREATE INDEX IF NOT EXISTS idx_erp_clinic_appts_patient ON erp_clinic_appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_erp_clinic_appts_when ON erp_clinic_appointments(scheduled_at);

ALTER TABLE erp_clinic_appointments ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS erp_clinic_appts_set_company ON erp_clinic_appointments;
CREATE TRIGGER erp_clinic_appts_set_company BEFORE INSERT ON erp_clinic_appointments
  FOR EACH ROW EXECUTE FUNCTION erp_set_company_id();

DROP TRIGGER IF EXISTS erp_clinic_appts_updated ON erp_clinic_appointments;
CREATE TRIGGER erp_clinic_appts_updated BEFORE UPDATE ON erp_clinic_appointments
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

DROP POLICY IF EXISTS "erp_clinic_appts_tenant" ON erp_clinic_appointments;
CREATE POLICY "erp_clinic_appts_tenant" ON erp_clinic_appointments FOR ALL
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());
