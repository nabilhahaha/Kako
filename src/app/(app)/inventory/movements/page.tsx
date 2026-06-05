import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getT } from '@/lib/i18n/server';
import { formatNumber, formatDateTime } from '@/lib/utils';

const TYPE_KEY: Record<string, string> = {
  purchase_in: 'ops.mtPurchaseIn',
  sale_out: 'ops.mtSaleOut',
  transfer_out: 'ops.mtTransferOut',
  transfer_in: 'ops.mtTransferIn',
  adjustment: 'ops.mtAdjustment',
  return_in: 'ops.mtReturnIn',
  return_out: 'ops.mtReturnOut',
  opening_balance: 'ops.mtOpeningBalance',
};

interface MovementRow {
  id: string;
  movement_type: string;
  quantity: number;
  reference_type: string | null;
  notes: string | null;
  created_at: string;
  product: { code: string; name: string; name_ar: string | null } | null;
  warehouse: { code: string; name: string; name_ar: string | null } | null;
}

export default async function StockMovementsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t, locale } = await getT();
  const pick = (en: string, ar: string | null) => (locale === 'ar' ? ar || en : en);

  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_stock_movements')
    .select('id, movement_type, quantity, reference_type, notes, created_at, product:erp_products_catalog(code, name, name_ar), warehouse:erp_warehouses(code, name, name_ar)')
    .order('created_at', { ascending: false })
    .limit(300);
  const rows = (data as unknown as MovementRow[]) ?? [];

  return (
    <div>
      <PageHeader title={t('ops.movTitle')} description={t('ops.movDescription')} />
      {rows.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('ops.movEmpty')}</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('ops.movDate')}</th>
                    <th className="p-3 text-start font-medium">{t('ops.movType')}</th>
                    <th className="p-3 text-start font-medium">{t('ops.movProduct')}</th>
                    <th className="p-3 text-start font-medium">{t('ops.movWarehouse')}</th>
                    <th className="p-3 text-end font-medium">{t('ops.movQty')}</th>
                    <th className="p-3 text-start font-medium">{t('ops.movNote')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.id} className="border-b last:border-0 hover:bg-secondary/30">
                      <td className="p-3 text-muted-foreground whitespace-nowrap" dir="ltr">{formatDateTime(m.created_at)}</td>
                      <td className="p-3"><Badge variant="secondary">{t(TYPE_KEY[m.movement_type] ?? 'ops.mtAdjustment')}</Badge></td>
                      <td className="p-3">{m.product ? pick(m.product.name, m.product.name_ar) : '—'}</td>
                      <td className="p-3">{m.warehouse ? pick(m.warehouse.name, m.warehouse.name_ar) : '—'}</td>
                      <td className="p-3 text-end tabular-nums" dir="ltr">
                        <span className={Number(m.quantity) < 0 ? 'text-destructive' : 'text-success'}>
                          {Number(m.quantity) > 0 ? '+' : ''}{formatNumber(Number(m.quantity))}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">{m.notes ?? '—'}</td>
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
