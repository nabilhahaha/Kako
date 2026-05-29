import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { DoctorManager } from './doctor-manager';
import type { ClinicVisit } from '../clinical-ui';

export default async function DoctorPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (
      <div>
        <PageHeader title="شاشة الطبيب" />
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
          إدارة العيادة تتم من داخل حساب العيادة.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: visits } = await supabase
    .from('erp_clinic_visits')
    .select('id, patient_id, visit_date, visit_type, complaint, diagnosis, prescription, fee, paid_amount, status, temperature, blood_pressure, pulse, weight, height, followup_date, patient:erp_patients(name, phone)')
    .order('visit_date', { ascending: false })
    .limit(200);

  return (
    <div>
      <PageHeader title="شاشة الطبيب" description="طابور الكشف — ابدأ الكشف، اكتب التشخيص والروشتة، وافتح الملف الطبي الكامل للمريض." />
      <DoctorManager visits={(visits as unknown as ClinicVisit[]) ?? []} />
    </div>
  );
}
