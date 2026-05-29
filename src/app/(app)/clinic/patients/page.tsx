import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { PatientsManager, type Patient } from './patients-manager';

export default async function PatientsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (
      <div>
        <PageHeader title="المرضى" />
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
          إدارة العيادة تتم من داخل حساب العيادة.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: patients } = await supabase
    .from('erp_patients')
    .select('id, code, name, phone, gender, birth_date, blood_type, allergies, notes')
    .eq('is_active', true)
    .order('name', { ascending: true });

  return (
    <div>
      <PageHeader title="المرضى" description="ملفات المرضى المسجّلين في العيادة." />
      <PatientsManager patients={(patients as Patient[]) ?? []} />
    </div>
  );
}
