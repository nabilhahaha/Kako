import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { VisitsManager, type Visit, type PatientOption } from './visits-manager';
import type { DoctorOption } from '../clinical-ui';

export default async function VisitsPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (
      <div>
        <PageHeader title="الكشوفات" />
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
          إدارة العيادة تتم من داخل حساب العيادة.
        </p>
      </div>
    );
  }

  const { patient: initialPatientId } = await searchParams;

  const supabase = await createClient();
  const [{ data: visits }, { data: patients }, { data: doctors }] = await Promise.all([
    supabase
      .from('erp_clinic_visits')
      .select('id, patient_id, doctor_id, visit_date, visit_type, complaint, diagnosis, prescription, tests, fee, paid_amount, status, temperature, blood_pressure, pulse, weight, height, followup_date, patient:erp_patients(name, phone)')
      .order('visit_date', { ascending: false })
      .limit(200),
    supabase.from('erp_patients').select('id, name, phone').eq('is_active', true).order('name'),
    supabase.rpc('erp_clinic_doctors'),
  ]);

  return (
    <div>
      <PageHeader title="الكشوفات" description="طابور العيادة اليومي — استقبال، فحص (تشخيص وروشتة وعلامات حيوية)، وتحصيل." />
      <VisitsManager
        visits={(visits as unknown as Visit[]) ?? []}
        patients={(patients as PatientOption[]) ?? []}
        doctors={(doctors as DoctorOption[]) ?? []}
        initialPatientId={initialPatientId ?? null}
      />
    </div>
  );
}
