import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { requirePermission } from '@/lib/erp/guards';
import { InstallmentsBoard } from './installments-board';

interface PlanRow {
  id: string; total_amount: number; down_payment: number; financed_amount: number; status: string;
  customer: { name: string } | null;
  schedule: { id: string; seq_no: number; due_date: string; amount: number; paid_amount: number; status: string }[];
}

export default async function FashionInstallmentsPage() {
  const { t, locale } = await getT();
  await requirePermission('fashion.installments');
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (<div><PageHeader title={t('fashion.installments.title')} /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{t('fashion.common.noCompany')}</p></div>);
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_installment_plans')
    .select('id, total_amount, down_payment, financed_amount, status, customer:erp_customers(name), schedule:erp_installment_schedule(id, seq_no, due_date, amount, paid_amount, status)')
    .order('created_at', { ascending: false }).limit(100);

  const plans = ((data as unknown as PlanRow[]) ?? []).map((p) => ({
    ...p, schedule: [...(p.schedule ?? [])].sort((a, b) => a.seq_no - b.seq_no),
  }));

  return (
    <div>
      <PageHeader title={t('fashion.installments.title')} description={t('fashion.installments.description')} />
      <InstallmentsBoard plans={plans} locale={locale} today={new Date().toISOString().slice(0, 10)} />
    </div>
  );
}
