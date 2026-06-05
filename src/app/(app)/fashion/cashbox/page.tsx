import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { requirePermission } from '@/lib/erp/guards';
import { cashboxSummary, type CashMovement } from '@/lib/fashion/cashbox';
import { CashboxPanel } from './cashbox-panel';

export default async function FashionCashboxPage() {
  const { t, locale } = await getT();
  await requirePermission('fashion.cashbox');
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (<div><PageHeader title={t('fashion.cashbox.title')} /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{t('fashion.common.noCompany')}</p></div>);
  }

  const supabase = await createClient();
  const { data: sess } = await supabase
    .from('erp_cash_sessions').select('id, opening_float, opened_at')
    .eq('status', 'open').order('opened_at', { ascending: false }).limit(1).maybeSingle();
  const session = sess as { id: string; opening_float: number; opened_at: string } | null;

  let summary = null as ReturnType<typeof cashboxSummary> | null;
  if (session) {
    const { data: moves } = await supabase.from('erp_cash_movements').select('kind, amount').eq('session_id', session.id);
    summary = cashboxSummary(Number(session.opening_float || 0), (moves as CashMovement[]) ?? []);
  }

  return (
    <div>
      <PageHeader title={t('fashion.cashbox.title')} description={t('fashion.cashbox.description')} />
      <CashboxPanel session={session} summary={summary} locale={locale} />
    </div>
  );
}
