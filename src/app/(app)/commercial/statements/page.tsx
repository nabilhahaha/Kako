import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { MonthPicker } from '../month-picker';
import { StatementsClient, type Combined, type Payout, type NamedRow } from './statements-client';

function firstOfMonth(d?: string) { const x = d ? new Date(d) : new Date(); return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-01`; }

/** CP-6 — combined commission + incentive statements; admin run/approve. */
export default async function StatementsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.company?.id || !ctx.modules.includes('field_ops')) {
    return <div><PageHeader title={t('commercial.statementsTitle')} /><Card><CardContent className="p-8 text-center text-muted-foreground">{t('commercial.noAccess')}</CardContent></Card></div>;
  }
  const sp = await searchParams;
  const month = firstOfMonth(sp.month);
  const isAdmin = ctx.isPlatformOwner || ctx.isSuperAdmin || ctx.topRole === 'admin';
  const supabase = await createClient();
  const [combined, commission, incentive, plans, programs] = await Promise.all([
    supabase.rpc('erp_cp_payout_statement', { p_month: month }),
    supabase.rpc('erp_cp_commission_payouts_list', { p_month: month }),
    supabase.rpc('erp_cp_incentive_payouts_list', { p_month: month }),
    supabase.from('erp_cp_commission_plans').select('id,name,status').eq('company_id', ctx.company.id),
    supabase.from('erp_cp_incentive_programs').select('id,name,status').eq('company_id', ctx.company.id).eq('is_latest', true),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-3 pb-10">
      <BackLink href="/commercial" label={t('commercial.back')} />
      <PageHeader title={t('commercial.statementsTitle')} />
      <MonthPicker month={month} />
      <StatementsClient
        month={month} isAdmin={isAdmin}
        combined={(combined.data as Combined[]) ?? []}
        commission={(commission.data as Payout[]) ?? []}
        incentive={(incentive.data as Payout[]) ?? []}
        plans={(plans.data as NamedRow[]) ?? []}
        programs={(programs.data as NamedRow[]) ?? []}
      />
    </div>
  );
}
