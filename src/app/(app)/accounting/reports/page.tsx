import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import type { AccountType } from '@/lib/erp/types';
import { ReportsView, type AccountAgg, type AgingRow, type MarginRow } from './reports-view';
import { getT } from '@/lib/i18n/server';

interface LineRow {
  debit: number;
  credit: number;
  journal_entry_id: string;
  account: {
    code: string;
    name: string;
    name_ar: string | null;
    account_type: AccountType;
  } | null;
}

export default async function ReportsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();
  const supabase = await createClient();
  const { data: postedEntries } = await supabase
    .from('erp_journal_entries')
    .select('id')
    .eq('status', 'posted');
  const postedIds = new Set((postedEntries ?? []).map((e) => e.id));

  const { data } = await supabase
    .from('erp_journal_lines')
    .select(
      'debit, credit, journal_entry_id, account:erp_chart_of_accounts(code, name, name_ar, account_type)',
    );

  const lines = ((data as unknown as LineRow[]) ?? []).filter((l) =>
    postedIds.has(l.journal_entry_id),
  );

  const byAccount = new Map<string, AccountAgg>();
  for (const l of lines) {
    if (!l.account) continue;
    const key = l.account.code;
    const row =
      byAccount.get(key) ??
      {
        code: l.account.code,
        name: l.account.name_ar || l.account.name,
        type: l.account.account_type,
        debit: 0,
        credit: 0,
      };
    row.debit += Number(l.debit);
    row.credit += Number(l.credit);
    byAccount.set(key, row);
  }

  // ─── Customer aging (unpaid issued invoices bucketed by age) ───────────────
  const today = new Date();
  const { data: openInvoices } = await supabase
    .from('erp_invoices')
    .select('customer_id, net_amount, paid_amount, created_at, customer:erp_customers(name, name_ar)')
    .in('status', ['issued', 'partially_paid', 'overdue']);

  const agingMap = new Map<string, AgingRow>();
  for (const inv of (openInvoices as unknown as Array<{
    customer_id: string;
    net_amount: number;
    paid_amount: number;
    created_at: string;
    customer: { name: string; name_ar: string | null } | null;
  }>) ?? []) {
    const due = Number(inv.net_amount) - Number(inv.paid_amount);
    if (due <= 0.001) continue;
    const ageDays = Math.floor((today.getTime() - new Date(inv.created_at).getTime()) / 86400000);
    const row =
      agingMap.get(inv.customer_id) ??
      {
        customer: inv.customer?.name_ar || inv.customer?.name || '—',
        d0_30: 0, d31_60: 0, d61_90: 0, d90: 0, total: 0,
      };
    if (ageDays <= 30) row.d0_30 += due;
    else if (ageDays <= 60) row.d31_60 += due;
    else if (ageDays <= 90) row.d61_90 += due;
    else row.d90 += due;
    row.total += due;
    agingMap.set(inv.customer_id, row);
  }
  const aging = [...agingMap.values()].sort((a, b) => b.total - a.total);

  // ─── Product margin (sold qty/revenue vs cost) ─────────────────────────────
  const { data: soldLines } = await supabase
    .from('erp_invoice_lines')
    .select('product_id, quantity, line_total, invoice:erp_invoices!inner(status), product:erp_products_catalog(code, name, name_ar, cost_price)');

  const marginMap = new Map<string, MarginRow>();
  for (const l of (soldLines as unknown as Array<{
    product_id: string;
    quantity: number;
    line_total: number;
    invoice: { status: string } | null;
    product: { code: string; name: string; name_ar: string | null; cost_price: number } | null;
  }>) ?? []) {
    if (!l.invoice || l.invoice.status === 'draft' || l.invoice.status === 'cancelled') continue;
    if (!l.product) continue;
    const row =
      marginMap.get(l.product_id) ??
      {
        code: l.product.code,
        name: l.product.name_ar || l.product.name,
        qty: 0,
        revenue: 0,
        cost: 0,
      };
    row.qty += Number(l.quantity);
    row.revenue += Number(l.line_total);
    row.cost += Number(l.quantity) * Number(l.product.cost_price);
    marginMap.set(l.product_id, row);
  }
  const margin = [...marginMap.values()].sort((a, b) => b.revenue - a.revenue);

  return (
    <div>
      <PageHeader
        title={t('accounting.reports.title')}
        description={t('accounting.reports.description')}
      />
      <ReportsView accounts={[...byAccount.values()]} aging={aging} margin={margin} />
    </div>
  );
}
