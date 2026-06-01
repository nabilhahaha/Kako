import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatNumber } from '@/lib/utils';
import { getT } from '@/lib/i18n/server';

interface SerialRow {
  id: string;
  serial_no: string;
  status: 'in_stock' | 'sold' | 'returned' | 'rma' | 'scrapped';
  unit_cost: number | null;
  received_at: string | null;
  product: { code: string; name: string; name_ar: string | null } | null;
  warehouse: { code: string; name: string; name_ar: string | null } | null;
}

const STATUS_VARIANT = {
  in_stock: 'success', sold: 'default', returned: 'warning', rma: 'warning', scrapped: 'destructive',
} as const;

export default async function SerialsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  // Pack-scoped: only roles granted electrical.rma (electronics tenants) see this.
  if (!hasPermission(ctx, 'electrical.rma')) redirect('/dashboard');

  const { t, locale } = await getT();
  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_product_serials')
    .select('id, serial_no, status, unit_cost, received_at, product:erp_products_catalog(code, name, name_ar), warehouse:erp_warehouses(code, name, name_ar)')
    .order('received_at', { ascending: false })
    .limit(500);
  const rows = (data as unknown as SerialRow[]) ?? [];
  const statusLabel = (s: SerialRow['status']) => t(`electrical.status${s.replace(/(^|_)([a-z])/g, (_, __, c) => c.toUpperCase())}`);

  return (
    <div>
      <PageHeader title={t('electrical.serialsTitle')} description={t('electrical.serialsDescription')} />
      {rows.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('electrical.serialsEmpty')}</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('electrical.colSerial')}</th>
                    <th className="p-3 text-start font-medium">{t('electrical.colProduct')}</th>
                    <th className="p-3 text-start font-medium">{t('electrical.colStatus')}</th>
                    <th className="p-3 text-start font-medium">{t('electrical.colWarehouse')}</th>
                    <th className="p-3 text-end font-medium">{t('electrical.colCost')}</th>
                    <th className="p-3 text-start font-medium">{t('electrical.colReceived')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="p-3 font-medium" dir="ltr">{r.serial_no}</td>
                      <td className="p-3">{r.product ? (locale === 'ar' ? r.product.name_ar || r.product.name : r.product.name) : '—'}</td>
                      <td className="p-3"><Badge variant={STATUS_VARIANT[r.status]}>{statusLabel(r.status)}</Badge></td>
                      <td className="p-3">{r.warehouse ? (locale === 'ar' ? r.warehouse.name_ar || r.warehouse.name : r.warehouse.name) : '—'}</td>
                      <td className="p-3 text-end tabular-nums" dir="ltr">{r.unit_cost != null ? formatNumber(r.unit_cost) : '—'}</td>
                      <td className="p-3" dir="ltr">{r.received_at ? formatDate(r.received_at) : '—'}</td>
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
