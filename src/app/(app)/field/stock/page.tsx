import { redirect } from 'next/navigation';
import { Boxes, PackageCheck, PackageX, AlertTriangle } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { hasPermission } from '@/lib/erp/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/server';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { stockMovementReportEnabled } from '@/lib/van-sales/sell';
import { buttonVariants } from '@/components/ui/button';
import { stockStatus, summarizeStock, rankStock, type StockStatus } from '@/lib/erp/stock-risk';

// Stock visibility — on-hand availability with low/out risk indicators, risk-first.
// Reuses erp_inventory_stock (RLS-scoped). Near-expiry is NOT available (no
// expiry/batch column) — see VAN-OPS-SPRINT.md. Additive; no schema change.

async function safe<T>(fn: () => Promise<T>, fb: T): Promise<T> { try { return await fn(); } catch { return fb; } }

const BADGE: Record<StockStatus, { variant: 'success' | 'warning' | 'destructive'; key: string }> = {
  ok: { variant: 'success', key: 'vanops.inStock' },
  low: { variant: 'warning', key: 'vanops.lowStock' },
  out: { variant: 'destructive', key: 'vanops.outOfStock' },
};

export default async function StockVisibilityPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const allowed = ctx.isPlatformOwner || ctx.isSuperAdmin || hasPermission(ctx, 'inventory.view') || hasPermission(ctx, 'field.sales') || ctx.memberships.some((m) => m.role === 'admin' || m.role === 'manager');
  if (!allowed) redirect('/dashboard');

  const { t, locale } = await getT();
  const supabase = await createClient();
  const pick = (en: string | null | undefined, ar: string | null | undefined) => (locale === 'ar' ? ar || en : en) ?? '';

  const rawRows = await safe(async () => {
    const { data } = await supabase.from('erp_inventory_stock').select('warehouse_id, product_id, quantity, reserved_qty').limit(1000);
    return (data ?? []) as { warehouse_id: string; product_id: string; quantity: number | null; reserved_qty: number | null }[];
  }, []);

  const products = await safe(async () => {
    const ids = [...new Set(rawRows.map((r) => r.product_id))];
    if (!ids.length) return new Map<string, { name: string; name_ar: string | null }>();
    const { data } = await supabase.from('erp_products_catalog').select('id, name, name_ar').in('id', ids);
    return new Map((data ?? []).map((p) => [(p as { id: string }).id, p as { name: string; name_ar: string | null }]));
  }, new Map<string, { name: string; name_ar: string | null }>());

  const warehouses = await safe(async () => {
    const ids = [...new Set(rawRows.map((r) => r.warehouse_id))];
    if (!ids.length) return new Map<string, { name: string; name_ar: string | null }>();
    const { data } = await supabase.from('erp_warehouses').select('id, name, name_ar').in('id', ids);
    return new Map((data ?? []).map((w) => [(w as { id: string }).id, w as { name: string; name_ar: string | null }]));
  }, new Map<string, { name: string; name_ar: string | null }>());

  const rows = rankStock(rawRows.map((r) => ({
    product: products.get(r.product_id),
    warehouse: warehouses.get(r.warehouse_id),
    available: Number(r.quantity ?? 0) - Number(r.reserved_qty ?? 0),
  })));
  const summary = summarizeStock(rows);

  return (
    <div className="space-y-6">
      <BackLink href="/today" label={t('common.back')} />
      <PageHeader
        title={t('vanops.stockTitle')}
        description={t('vanops.stockSubtitle')}
        action={stockMovementReportEnabled(await getFeatureFlags(supabase, ctx.companyId)) ? (
          <a href="/field/stock/movements" className={buttonVariants({ size: 'sm', variant: 'outline' })}>{t('vanSales.stockMove.title')}</a>
        ) : undefined}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('vanops.inStock')} value={String(summary.ok)} icon={PackageCheck} tone="success" />
        <StatCard label={t('vanops.lowStock')} value={String(summary.low)} icon={AlertTriangle} tone={summary.low > 0 ? 'warning' : 'success'} />
        <StatCard label={t('vanops.outOfStock')} value={String(summary.out)} icon={PackageX} tone={summary.out > 0 ? 'destructive' : 'success'} />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<Boxes />} title={t('vanops.noStock')} description={t('vanops.expiryNote')} />
      ) : (
        <ul className="space-y-2">
          {rows.map((r, i) => {
            const st = stockStatus(r.available);
            const b = BADGE[st];
            return (
              <li key={i}>
                <Card>
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.product ? pick(r.product.name, r.product.name_ar) : '—'}</p>
                      {r.warehouse ? <p className="truncate text-xs text-muted-foreground">{pick(r.warehouse.name, r.warehouse.name_ar)}</p> : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold tabular-nums" dir="ltr">{r.available}</span>
                      <Badge variant={b.variant}>{t(b.key)}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">{t('vanops.expiryNote')}</p>
    </div>
  );
}
