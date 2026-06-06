import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Printer } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { requirePermission } from '@/lib/erp/guards';
import { formatCurrency, formatDate } from '@/lib/utils';
import { INTL_LOCALE, type Locale } from '@/lib/i18n/config';
import { cashboxSummary, type CashMovement } from '@/lib/fashion/cashbox';
import { CashboxPanel } from './cashbox-panel';
import { CashLedger, type LedgerMovement } from './cash-ledger';

export default async function FashionCashboxPage() {
  const { t, locale } = await getT();
  await requirePermission('fashion.cashbox');
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (<div><PageHeader title={t('fashion.cashbox.title')} /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{t('fashion.common.noCompany')}</p></div>);
  }
  const canManage = ctx.permissions.includes('fashion.manage');

  const supabase = await createClient();
  const { data: sess } = await supabase
    .from('erp_cash_sessions').select('id, opening_float, opened_at, branch_id, status, closing_counted, notes')
    .in('status', ['open', 'draft_closed']).order('opened_at', { ascending: false }).limit(1).maybeSingle();
  const session = sess as {
    id: string; opening_float: number; opened_at: string; branch_id: string | null;
    status: 'open' | 'draft_closed'; closing_counted: number | null; notes: string | null;
  } | null;

  let summary = null as ReturnType<typeof cashboxSummary> | null;
  let movements: LedgerMovement[] = [];
  let cardSales = 0;
  let transferSales = 0;
  let defaultOpening = 0;

  if (session) {
    const { data: moves } = await supabase
      .from('erp_cash_movements').select('kind, amount, note, created_at, reference_type')
      .eq('session_id', session.id).order('created_at', { ascending: true });
    movements = (moves as LedgerMovement[]) ?? [];
    summary = cashboxSummary(Number(session.opening_float || 0), movements as CashMovement[]);

    // Non-cash tender since the session opened (informational, for the daily report).
    const { data: tender } = await supabase
      .from('erp_payments')
      .select('amount, payment_method, invoice:erp_invoices!inner(branch_id)')
      .in('payment_method', ['credit_card', 'bank_transfer'])
      .gte('created_at', session.opened_at);
    for (const p of (tender as unknown as { amount: number; payment_method: string; invoice: { branch_id: string | null } | null }[]) ?? []) {
      if (session.branch_id && p.invoice?.branch_id && p.invoice.branch_id !== session.branch_id) continue;
      if (p.payment_method === 'credit_card') cardSales += Number(p.amount) || 0;
      else if (p.payment_method === 'bank_transfer') transferSales += Number(p.amount) || 0;
    }
  } else {
    // Carry-forward: default the next opening to the last close's leftover cash.
    const { data: last } = await supabase
      .from('erp_cash_sessions').select('carried_forward, closing_counted')
      .eq('status', 'closed').order('closed_at', { ascending: false }).limit(1).maybeSingle();
    const lc = last as { carried_forward: number | null; closing_counted: number | null } | null;
    defaultOpening = Number(lc?.carried_forward ?? lc?.closing_counted ?? 0) || 0;
  }

  // Recent closings (draft + final) for the printable report links.
  const { data: recent } = await supabase
    .from('erp_cash_sessions')
    .select('id, opened_at, closed_at, status, expected_amount, closing_counted, variance')
    .in('status', ['draft_closed', 'closed']).order('closed_at', { ascending: false }).limit(8);
  const recentClosings = (recent as RecentClosing[]) ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title={t('fashion.cashbox.title')} description={t('fashion.cashbox.description')} />
      <CashboxPanel
        session={session}
        summary={summary}
        cardSales={cardSales}
        transferSales={transferSales}
        canManage={canManage}
        defaultOpening={defaultOpening}
        locale={locale}
      />
      {session && summary && (
        <CashLedger openingFloat={summary.openingFloat} expected={summary.expected} movements={movements} locale={locale} />
      )}
      <RecentClosings rows={recentClosings} locale={locale} t={t} />
    </div>
  );
}

interface RecentClosing {
  id: string; opened_at: string; closed_at: string | null; status: 'draft_closed' | 'closed';
  expected_amount: number | null; closing_counted: number | null; variance: number | null;
}

function RecentClosings({ rows, locale, t }: { rows: RecentClosing[]; locale: Locale; t: Awaited<ReturnType<typeof getT>>['t'] }) {
  if (rows.length === 0) return null;
  const intl = INTL_LOCALE[locale];
  const money = (n: number | null) => formatCurrency(Number(n) || 0, 'EGP', intl);
  return (
    <div className="rounded-lg border bg-card">
      <h2 className="border-b p-3 text-sm font-semibold">{t('fashion.cashbox.recentClosings')}</h2>
      <div className="divide-y">
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <div className="min-w-0">
              <span className="font-medium">{formatDate(r.closed_at ?? r.opened_at, intl)}</span>
              <span className={`ms-2 rounded-full px-2 py-0.5 text-xs ${r.status === 'closed' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'}`}>
                {r.status === 'closed' ? t('fashion.cashbox.final') : t('fashion.cashbox.draft')}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground" dir="ltr">
              <span>{t('fashion.cashbox.expected')}: <span className="tabular-nums text-foreground">{money(r.expected_amount)}</span></span>
              <span>{t('fashion.cashbox.variance')}: <span className="tabular-nums">{money(r.variance)}</span></span>
              <Link href={`/print/fashion/closing/${r.id}`} target="_blank" className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 font-medium text-foreground hover:bg-secondary/70">
                <Printer className="h-3.5 w-3.5" /> {t('fashion.cashbox.report')}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
