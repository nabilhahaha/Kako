import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { stockMovementReportEnabled } from '@/lib/van-sales/sell';
import { classifyMovement } from '@/lib/van-sales/stock-movement';
import { BackLink } from '@/components/shared/back-link';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

const COL_TONE: Record<string, 'success' | 'warning' | 'info' | 'destructive' | 'secondary'> = {
  load: 'success', sales: 'secondary', saleableReturn: 'info', damageReturn: 'destructive', expiry: 'destructive', adjustment: 'warning',
};

// Per-SKU stock movement detail — the chronological log that explains the running
// balance (Opening → Load → Sales → Returns → Adjustments → Current) for one
// product in the rep's van.
export default async function StockMovementDetailPage({ params, searchParams }: { params: Promise<{ productId: string }>; searchParams: Promise<{ rep?: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  const { productId } = await params;
  const sp = await searchParams;
  const self = !sp.rep || sp.rep === ctx.userId;
  const repId = self ? ctx.userId : sp.rep!;
  const canSelf = hasPermission(ctx, 'field.sales') || hasPermission(ctx, 'inventory.view') || ctx.isSuperAdmin;
  const canOther = hasPermission(ctx, 'reports.view') || hasPermission(ctx, 'inventory.view') || ctx.isSuperAdmin;
  if (self ? !canSelf : !canOther) redirect('/dashboard');

  const flags = ctx.companyId ? await getFeatureFlags(supabase, ctx.companyId) : null;
  if (!stockMovementReportEnabled(flags)) notFound();

  const { t, locale } = await getT();
  const intl = INTL_LOCALE[locale];

  const { data: van } = await supabase.from('erp_warehouses').select('id').eq('is_van', true).eq('assigned_to', repId).eq('is_active', true).limit(1).maybeSingle();
  const whId = (van as { id: string } | null)?.id;
  if (!whId) notFound();

  const [{ data: prod }, { data: moves }, { data: stock }] = await Promise.all([
    supabase.from('erp_products_catalog').select('name, name_ar, code').eq('id', productId).maybeSingle(),
    supabase.from('erp_stock_movements').select('movement_type, quantity, reference_type, created_at, notes').eq('warehouse_id', whId).eq('product_id', productId).order('created_at', { ascending: true }).limit(2000),
    supabase.from('erp_inventory_stock').select('quantity').eq('warehouse_id', whId).eq('product_id', productId).maybeSingle(),
  ]);
  const p = prod as { name: string; name_ar: string | null; code: string | null } | null;
  const name = p ? (locale === 'ar' ? p.name_ar || p.name : p.name) : productId;
  const current = Number((stock as { quantity: number | null } | null)?.quantity ?? 0);
  const rows = ((moves ?? []) as { movement_type: string; quantity: number; reference_type: string | null; created_at: string; notes: string | null }[]);

  // Running balance forward.
  let run = 0;
  const withRun = rows.map((m) => { run += Number(m.quantity ?? 0); return { ...m, run }; });

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-10">
      <BackLink href={`/field/stock/movements${self ? '' : `?rep=${repId}`}`} label={t('vanSales.stockMove.backToReport')} />
      <PageHeader title={name} description={p?.code ? `${t('vanSales.stockMove.sku')}: ${p.code} — ${t('vanSales.stockMove.current')}: ${current.toLocaleString()}` : `${t('vanSales.stockMove.current')}: ${current.toLocaleString()}`} />

      <Card><CardContent className="p-0">
        {withRun.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{t('vanSales.stockMove.noMovements')}</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="border-b bg-secondary/50 text-muted-foreground"><tr>
              <th className="p-2 text-start font-medium">{t('vanSales.stockMove.colDate')}</th>
              <th className="p-2 text-start font-medium">{t('vanSales.stockMove.colMove')}</th>
              <th className="p-2 text-end font-medium">{t('vanSales.stockMove.colQty')}</th>
              <th className="p-2 text-end font-medium">{t('vanSales.stockMove.colBalance')}</th>
            </tr></thead>
            <tbody>
              {withRun.map((m, i) => {
                const col = classifyMovement(m.movement_type);
                return (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-2 text-muted-foreground" dir="ltr">{formatDate(m.created_at, intl)}</td>
                    <td className="p-2">{col ? <Badge variant={COL_TONE[col]}>{t(`vanSales.stockMove.${col}`)}</Badge> : <span className="text-muted-foreground">{m.movement_type}</span>}</td>
                    <td className={`p-2 text-end tabular-nums ${m.quantity < 0 ? 'text-destructive' : 'text-success'}`} dir="ltr">{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                    <td className="p-2 text-end font-semibold tabular-nums" dir="ltr">{m.run.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </CardContent></Card>
    </div>
  );
}
