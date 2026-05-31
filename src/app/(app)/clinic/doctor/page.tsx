import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { requireAnyPermission } from '@/lib/erp/guards';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { DoctorManager } from './doctor-manager';
import type { ClinicVisit, DoctorOption } from '../clinical-ui';
import { getT } from '@/lib/i18n/server';

export default async function DoctorPage() {
  await requireAnyPermission(['clinic.manage', 'clinic.doctor']);
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (
      <div>
        <PageHeader title={t('clinic.doctor.title')} />
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
          {t('clinic.doctor.noCompany')}
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: visits }, { data: doctors }] = await Promise.all([
    supabase
      .from('erp_clinic_visits')
      .select('id, patient_id, doctor_id, visit_date, visit_type, complaint, diagnosis, prescription, tests, fee, paid_amount, status, temperature, blood_pressure, pulse, weight, height, followup_date, patient:erp_patients(name, phone)')
      .eq('visit_date', today)
      .order('created_at', { ascending: true })
      .limit(300),
    supabase.rpc('erp_clinic_doctors'),
  ]);

  return (
    <div>
      <PageHeader title={t('clinic.doctor.title')} description={t('clinic.doctor.description')} />
      <DoctorManager
        visits={(visits as unknown as ClinicVisit[]) ?? []}
        doctors={(doctors as DoctorOption[]) ?? []}
        currentDoctorId={ctx.userId}
      />
    </div>
  );
}
