import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { requirePermission } from '@/lib/erp/guards';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { VisitsManager, type Visit, type PatientOption } from './visits-manager';
import type { DoctorOption, ServiceOption } from '../clinical-ui';
import { getT } from '@/lib/i18n/server';

export default async function VisitsPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  await requirePermission('clinic.manage');
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (
      <div>
        <PageHeader title={t('clinic.visits.title')} />
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
          {t('clinic.visits.noCompany')}
        </p>
      </div>
    );
  }

  const { patient: initialPatientId } = await searchParams;

  const supabase = await createClient();
  const [{ data: visits }, { data: patients }, { data: doctors }, { data: services }] = await Promise.all([
    supabase
      .from('erp_clinic_visits')
      .select('id, patient_id, doctor_id, visit_date, visit_type, complaint, diagnosis, prescription, tests, fee, paid_amount, status, temperature, blood_pressure, pulse, weight, height, followup_date, patient:erp_patients(name, phone)')
      .order('visit_date', { ascending: false })
      .limit(200),
    supabase.from('erp_patients').select('id, name, phone').eq('is_active', true).order('name'),
    supabase.rpc('erp_clinic_doctors'),
    supabase.from('erp_clinic_services').select('id, name, price').eq('is_active', true).order('name'),
  ]);

  return (
    <div>
      <PageHeader title={t('clinic.visits.title')} description={t('clinic.visits.description')} />
      <VisitsManager
        visits={(visits as unknown as Visit[]) ?? []}
        patients={(patients as PatientOption[]) ?? []}
        doctors={(doctors as DoctorOption[]) ?? []}
        services={(services as ServiceOption[]) ?? []}
        initialPatientId={initialPatientId ?? null}
      />
    </div>
  );
}
