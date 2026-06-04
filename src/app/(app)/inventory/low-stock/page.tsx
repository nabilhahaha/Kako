import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { PackageCheck } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import { getT } from '@/lib/i18n/server';

interface ProductRow {
  id: string;
  name: string;
  name_ar: string | null;
  code: string;
  unit: string | null;
  min_stock: number | null;
}

export default async function LowStockPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();
  const supabase = await createClient();

  // Products that have a reorder threshold set.
  const { data: products } = await supabase
    .from('erp_products_catalog')
    .select('id, name, name_ar, code, unit, min_stock')
    .eq('is_active', true)
    .gt('min_stock', 0);

  const productList = (products as ProductRow[]) ?? [];
  const productIds = productList.map((p) => p.id);

  // Current on-hand per product (summed across warehouses).
  const onHand = new Map<string, number>();
  if (productIds.length > 0) {
    const { data: stock } = await supabase
      .from('erp_inventory_stock')
      .select('product_id, quantity')
      .in('product_id', productIds);
    for (const s of (stock as { product_id: string; quantity: number }[]) ?? []) {
      onHand.set(s.product_id, (onHand.get(s.product_id) ?? 0) + (s.quantity ?? 0));
    }
  }

  const low = productList
    .map((p) => {
      const qty = onHand.get(p.id) ?? 0;
      const min = p.min_stock ?? 0;
      return { ...p, qty, min, deficit: min - qty };
    })
    .filter((p) => p.qty <= p.min)
    .sort((a, b) => b.deficit - a.deficit);

  return (
    <div>
      <PageHeader
        title={t('inventory.lowStockPageTitle')}
        description={t('inventory.lowStockPageDescription')}
      />
      {low.length === 0 ? (
        <EmptyState icon={<PackageCheck />} title={t('inventory.emptyLowStock')} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('inventory.colProduct')}</th>
                    <th className="p-3 text-start font-medium">{t('inventory.colCode')}</th>
                    <th className="p-3 text-center font-medium">{t('inventory.colAvailable')}</th>
                    <th className="p-3 text-center font-medium">{t('inventory.colReorderLevel')}</th>
                    <th className="p-3 text-center font-medium">{t('inventory.colDeficit')}</th>
                  </tr>
                </thead>
                <tbody>
                  {low.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="p-3">{p.name_ar || p.name}</td>
                      <td className="p-3 text-muted-foreground" dir="ltr">{p.code}</td>
                      <td className="p-3 text-center tabular-nums" dir="ltr">
                        {formatNumber(p.qty)}
                        {p.unit ? ` ${p.unit}` : ''}
                      </td>
                      <td className="p-3 text-center tabular-nums" dir="ltr">{formatNumber(p.min)}</td>
                      <td className="p-3 text-center">
                        <Badge variant={p.qty <= 0 ? 'destructive' : 'warning'}>
                          {p.qty <= 0 ? t('inventory.statusOutOfStock') : formatNumber(p.deficit)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
