import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { getT } from '@/lib/i18n/server';
import { INTL_LOCALE } from '@/lib/i18n/config';
import type { Branch, InvoiceStatus } from '@/lib/erp/types';

const ACTIVE: InvoiceStatus[] = ['issued', 'paid', 'partially_paid', 'overdue'];

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; branch?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t, locale } = await getT();

  const sp = await searchParams;
  const from = sp.from || monthStart();
  const to = sp.to || new Date().toISOString().slice(0, 10);
  const branch = sp.branch || '';

  const supabase = await createClient();
  const { data: branches } = await supabase
    .from('erp_branches')
    .select('*')
    .eq('is_active', true)
    .order('code');
  const branchList = (branches as Branch[]) ?? [];

  let invQuery = supabase
    .from('erp_invoices')
    .select('id, branch_id, net_amount, paid_amount, status, created_at')
    .in('status', ACTIVE)
    .gte('created_at', from)
    .lte('created_at', `${to}T23:59:59`);
  if (branch) invQuery = invQuery.eq('branch_id', branch);
  const { data: invoices } = await invQuery;
  const invList = invoices ?? [];

  const totalNet = invList.reduce((s, i) => s + Number(i.net_amount), 0);
  const totalPaid = invList.reduce((s, i) => s + Number(i.paid_amount), 0);
  const outstanding = totalNet - totalPaid;

  // Sales by branch
  const branchName = (id: string) => {
    const b = branchList.find((x) => x.id === id);
    return b ? b.name_ar || b.name : '—';
  };
  const byBranch = new Map<string, { net: number; count: number }>();
  for (const i of invList) {
    const r = byBranch.get(i.branch_id) ?? { net: 0, count: 0 };
    r.net += Number(i.net_amount);
    r.count += 1;
    byBranch.set(i.branch_id, r);
  }
  const branchRows = [...byBranch.entries()]
    .map(([id, v]) => ({ id, name: branchName(id), ...v }))
    .sort((a, b) => b.net - a.net);

  // Top products
  const invoiceIds = invList.map((i) => i.id);
  let topProducts: Array<{ id: string; name: string; qty: number; value: number }> = [];
  if (invoiceIds.length > 0) {
    const { data: lines } = await supabase
      .from('erp_invoice_lines')
      .select('product_id, quantity, line_total, product:erp_products_catalog(name, name_ar)')
      .in('invoice_id', invoiceIds);
    const agg = new Map<string, { name: string; qty: number; value: number }>();
    for (const l of (lines as unknown as Array<{
      product_id: string;
      quantity: number;
      line_total: number;
      product: { name: string; name_ar: string | null } | null;
    }>) ?? []) {
      const r = agg.get(l.product_id) ?? {
        name: l.product?.name_ar || l.product?.name || '—',
        qty: 0,
        value: 0,
      };
      r.qty += Number(l.quantity);
      r.value += Number(l.line_total);
      agg.set(l.product_id, r);
    }
    topProducts = [...agg.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }

  return (
    <div>
      <PageHeader title={t('sales.reportTitle')} description={t('sales.reportDescription')} />

      <Card className="mb-4">
        <CardContent className="pt-6">
          <form className="flex flex-wrap items-end gap-3" method="get">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t('sales.reportLabelFrom')}</label>
              <input type="date" name="from" defaultValue={from} dir="ltr" className="h-10 rounded-md border border-input bg-background px-3 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t('sales.reportLabelTo')}</label>
              <input type="date" name="to" defaultValue={to} dir="ltr" className="h-10 rounded-md border border-input bg-background px-3 text-sm" />
            </div>
            {branchList.length > 1 && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t('sales.reportLabelBranch')}</label>
                <select name="branch" defaultValue={branch} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">{t('sales.reportAllBranches')}</option>
                  {branchList.map((b) => (
                    <option key={b.id} value={b.id}>{b.name_ar || b.name}</option>
                  ))}
                </select>
              </div>
            )}
            <Button type="submit">{t('sales.reportBtnView')}</Button>
          </form>
        </CardContent>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={t('sales.reportStatTotalSales')} value={formatCurrency(totalNet, 'EGP', INTL_LOCALE[locale])} />
        <Stat label={t('sales.reportStatInvoiceCount')} value={formatNumber(invList.length, INTL_LOCALE[locale])} />
        <Stat label={t('sales.reportStatCollected')} value={formatCurrency(totalPaid, 'EGP', INTL_LOCALE[locale])} tone="ok" />
        <Stat label={t('sales.reportStatOutstanding')} value={formatCurrency(outstanding, 'EGP', INTL_LOCALE[locale])} tone={outstanding > 0 ? 'warn' : 'ok'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            <h3 className="border-b p-3 font-semibold">{t('sales.reportSectionByBranch')}</h3>
            {branchRows.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">{t('sales.reportNoSalesInPeriod')}</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-muted-foreground">
                  <tr>
                    <th className="p-2 ps-3 text-start font-medium">{t('sales.reportColBranch')}</th>
                    <th className="p-2 text-center font-medium">{t('sales.reportColInvoiceCount')}</th>
                    <th className="p-2 pe-3 text-end font-medium">{t('sales.reportColSales')}</th>
                  </tr>
                </thead>
                <tbody>
                  {branchRows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-2 ps-3">{r.name}</td>
                      <td className="p-2 text-center tabular-nums" dir="ltr">{formatNumber(r.count, INTL_LOCALE[locale])}</td>
                      <td className="p-2 pe-3 text-left tabular-nums" dir="ltr">{formatCurrency(r.net, 'EGP', INTL_LOCALE[locale])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <h3 className="border-b p-3 font-semibold">{t('sales.reportSectionTopItems')}</h3>
            {topProducts.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">{t('sales.reportNoSalesInPeriod')}</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-muted-foreground">
                  <tr>
                    <th className="p-2 ps-3 text-start font-medium">{t('sales.reportColItem')}</th>
                    <th className="p-2 text-center font-medium">{t('sales.reportColQty')}</th>
                    <th className="p-2 pe-3 text-end font-medium">{t('sales.reportColValue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="p-2 ps-3">{p.name}</td>
                      <td className="p-2 text-center tabular-nums" dir="ltr">{formatNumber(p.qty, INTL_LOCALE[locale])}</td>
                      <td className="p-2 pe-3 text-left tabular-nums" dir="ltr">{formatCurrency(p.value, 'EGP', INTL_LOCALE[locale])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  const cls = tone === 'warn' ? 'text-warning' : tone === 'ok' ? 'text-success' : '';
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`mt-1 text-lg font-bold tabular-nums ${cls}`} dir="ltr">{value}</p>
      </CardContent>
    </Card>
  );
}
