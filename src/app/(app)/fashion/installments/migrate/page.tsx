import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { requirePermission } from '@/lib/erp/guards';
import { MigrateForm, type CustomerOption, type BranchOption, type MigratedPlan } from './migrate-form';

export default async function InstallmentMigrationPage() {
  const { t } = await getT();
  await requirePermission('fashion.installments');
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (
      <div>
        <PageHeader title={t('ops.imTitle')} description={t('ops.imDescription')} />
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{t('fashion.common.noCompany')}</p>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: customers }, { data: branches }, { data: plans }] = await Promise.all([
    supabase.from('erp_customers').select('id, code, name, name_ar').eq('is_active', true).order('name').limit(2000),
    supabase.from('erp_branches').select('id, code, name, name_ar').eq('is_active', true).order('code'),
    supabase
      .from('erp_installment_plans')
      .select('id, reference, financed_amount, installment_count, status, contract_date, customer:erp_customers(name, name_ar)')
      .eq('is_migrated', true)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  return (
    <div>
      <PageHeader title={t('ops.imTitle')} description={t('ops.imDescription')} />
      <MigrateForm
        customers={(customers as CustomerOption[]) ?? []}
        branches={(branches as BranchOption[]) ?? []}
        plans={(plans as unknown as MigratedPlan[]) ?? []}
      />
    </div>
  );
}
