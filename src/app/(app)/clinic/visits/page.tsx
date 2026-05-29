import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { VisitsManager, type Visit, type PatientOption } from './visits-manager';

export default async function VisitsPage() {
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

  const supabase = await createClient();
  const [{ data: visits }, { data: patients }] = await Promise.all([
    supabase
      .from('erp_clinic_visits')
      .select('id, visit_date, visit_type, complaint, diagnosis, prescription, fee, paid_amount, status, patient:erp_patients(name, phone)')
      .order('visit_date', { ascending: false })
      .limit(200),
    supabase.from('erp_patients').select('id, name, phone').eq('is_active', true).order('name'),
  ]);

  return (
    <div>
      <PageHeader title="الكشوفات" description="كشوفات وزيارات المرضى — التشخيص والروشتة والرسوم." />
      <VisitsManager
        visits={(visits as unknown as Visit[]) ?? []}
        patients={(patients as PatientOption[]) ?? []}
      />
    </div>
  );
}
