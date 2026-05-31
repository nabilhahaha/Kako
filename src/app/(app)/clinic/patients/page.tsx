import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { requireAnyPermission } from '@/lib/erp/guards';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { PatientsManager, type Patient } from './patients-manager';
import { getT } from '@/lib/i18n/server';

export default async function PatientsPage() {
  await requireAnyPermission(['clinic.manage', 'clinic.reception', 'clinic.doctor']);
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (
      <div>
        <PageHeader title={t('clinic.patients.title')} />
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
          {t('clinic.patients.noCompany')}
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
      <PageHeader title={t('clinic.patients.title')} description={t('clinic.patients.description')} />
      <PatientsManager patients={(patients as Patient[]) ?? []} />
    </div>
  );
}
