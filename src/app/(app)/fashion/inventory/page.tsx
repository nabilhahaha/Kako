import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard as Stat } from '@/components/shared/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getT } from '@/lib/i18n/server';
import { requirePermission } from '@/lib/erp/guards';
import { formatCurrency } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { Boxes, AlertTriangle, Wallet } from 'lucide-react';

interface VariantRow { product: { id: string; code: string; name: string; cost_price: number; min_stock: number } | null }

export default async function FashionInventoryPage() {
  const { t, locale } = await getT();
  await requirePermission('fashion.inventory');
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (<div><PageHeader title={t('fashion.dashboard.statLowStock')} /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{t('fashion.common.noCompany')}</p></div>);
  }

  const supabase = await createClient();
  const [{ data: variants }, { data: stockRows }] = await Promise.all([
    supabase.from('erp_fashion_variants').select('product:erp_products_catalog(id, code, name, cost_price, min_stock)').eq('is_active', true),
    supabase.from('erp_inventory_stock').select('product_id, quantity'),
  ]);

  const stockByProduct = new Map<string, number>();
  for (const r of ((stockRows as { product_id: string; quantity: number }[]) ?? [])) {
    stockByProduct.set(r.product_id, (stockByProduct.get(r.product_id) ?? 0) + Number(r.quantity || 0));
  }

  const rows = ((variants as unknown as VariantRow[]) ?? [])
    .filter((v) => v.product)
    .map((v) => {
      const p = v.product!;
      const stock = stockByProduct.get(p.id) ?? 0;
      return { id: p.id, code: p.code, name: p.name, stock, min: Number(p.min_stock || 0), value: stock * Number(p.cost_price || 0) };
    })
    .sort((a, b) => a.stock - b.stock);

  const lowCount = rows.filter((r) => r.min > 0 && r.stock <= r.min).length;
  const valuation = rows.reduce((s, r) => s + r.value, 0);
  const money = (n: number) => formatCurrency(n, 'EGP', INTL_LOCALE[locale]);

  return (
    <div>
      <PageHeader title={t('fashion.reports.stock')} description={t('fashion.products.description')} />
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label={t('fashion.dashboard.statVariants')} value={String(rows.length)} icon={Boxes} tone="primary" />
        <Stat label={t('fashion.reports.lowStock')} value={String(lowCount)} icon={AlertTriangle} tone="warning" />
        <Stat label={t('fashion.reports.stock')} value={money(valuation)} icon={Wallet} tone="success" />
      </div>
      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-xs text-muted-foreground">
            <th className="p-3 text-start">{t('fashion.products.sku')}</th><th className="p-3 text-start">{t('fashion.products.name')}</th>
            <th className="p-3 text-end">{t('fashion.products.stock')}</th><th className="p-3 text-end">{t('fashion.products.minStock')}</th>
          </tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-b last:border-0">
              <td className="p-3 font-mono text-xs">{r.code}</td>
              <td className="p-3">{r.name}</td>
              <td className="p-3 text-end tabular-nums">{r.min > 0 && r.stock <= r.min ? <Badge variant="warning">{r.stock}</Badge> : r.stock}</td>
              <td className="p-3 text-end tabular-nums text-muted-foreground">{r.min || '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}
