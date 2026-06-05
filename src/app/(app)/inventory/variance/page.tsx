import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getT } from '@/lib/i18n/server';
import { formatNumber, formatCurrency, formatDate } from '@/lib/utils';

const COUNT_TYPE_KEY: Record<string, string> = {
  opening: 'ops.countOpening',
  monthly: 'ops.countMonthly',
  spot: 'ops.countSpot',
};

interface CountWithLines {
  id: string;
  count_number: string;
  count_type: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
  warehouse: { code: string; name: string; name_ar: string | null } | null;
  lines: Array<{
    system_qty: number;
    counted_qty: number;
    product: { code: string; name: string; name_ar: string | null; cost_price: number } | null;
  }>;
}

export default async function VarianceReportPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t, locale } = await getT();
  const pick = (en: string, ar: string | null) => (locale === 'ar' ? ar || en : en);

  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_stock_counts')
    .select('id, count_number, count_type, status, completed_at, created_at, warehouse:erp_warehouses(code, name, name_ar), lines:erp_stock_count_lines(system_qty, counted_qty, product:erp_products_catalog(code, name, name_ar, cost_price))')
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(50);

  const counts = (data as unknown as CountWithLines[]) ?? [];
  // keep only counts that actually have variances
  const withVar = counts
    .map((c) => ({ ...c, variances: c.lines.filter((l) => Number(l.counted_qty) !== Number(l.system_qty)) }))
    .filter((c) => c.variances.length > 0);

  return (
    <div>
      <PageHeader title={t('ops.varTitle')} description={t('ops.varDescription')} />
      {withVar.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('ops.varEmpty')}</CardContent></Card>
      ) : (
        <div className="space-y-5">
          {withVar.map((c) => {
            const totalValue = c.variances.reduce(
              (s, l) => s + (Number(l.counted_qty) - Number(l.system_qty)) * Number(l.product?.cost_price ?? 0),
              0,
            );
            return (
              <Card key={c.id}>
                <CardContent className="p-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs" dir="ltr">{c.count_number}</span>
                      <Badge variant="secondary">{t(COUNT_TYPE_KEY[c.count_type ?? 'monthly'] ?? 'ops.countMonthly')}</Badge>
                      {c.warehouse ? <span className="text-sm text-muted-foreground">{pick(c.warehouse.name, c.warehouse.name_ar)}</span> : null}
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-muted-foreground" dir="ltr">{formatDate(c.completed_at ?? c.created_at)}</span>
                      <span>{t('ops.varValue')}: <b className={totalValue < 0 ? 'text-destructive' : 'text-success'} dir="ltr">{formatCurrency(totalValue)}</b></span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-secondary/50 text-muted-foreground">
                        <tr>
                          <th className="p-3 text-start font-medium">{t('ops.movProduct')}</th>
                          <th className="p-3 text-end font-medium">{t('ops.varSystemQty')}</th>
                          <th className="p-3 text-end font-medium">{t('ops.varCountedQty')}</th>
                          <th className="p-3 text-end font-medium">{t('ops.varDiff')}</th>
                          <th className="p-3 text-end font-medium">{t('ops.varValue')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.variances.map((l, i) => {
                          const diff = Number(l.counted_qty) - Number(l.system_qty);
                          const val = diff * Number(l.product?.cost_price ?? 0);
                          return (
                            <tr key={i} className="border-b last:border-0">
                              <td className="p-3">{l.product ? pick(l.product.name, l.product.name_ar) : '—'}</td>
                              <td className="p-3 text-end tabular-nums" dir="ltr">{formatNumber(Number(l.system_qty))}</td>
                              <td className="p-3 text-end tabular-nums" dir="ltr">{formatNumber(Number(l.counted_qty))}</td>
                              <td className="p-3 text-end tabular-nums" dir="ltr">
                                <span className={diff < 0 ? 'text-destructive' : 'text-success'}>{diff > 0 ? '+' : ''}{formatNumber(diff)}</span>
                              </td>
                              <td className="p-3 text-end tabular-nums" dir="ltr">{formatCurrency(val)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
