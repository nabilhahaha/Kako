import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatNumber } from '@/lib/utils';
import { getT } from '@/lib/i18n/server';

interface ExpiryRow {
  id: string;
  quantity_received: number;
  batch_number: string | null;
  expiry_date: string;
  product: { code: string; name: string; name_ar: string | null } | null;
  receipt: { receipt_number: string; warehouse: { code: string; name: string; name_ar: string | null } | null } | null;
}

const WINDOW_DAYS = 90;

export default async function ExpiryReportPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();
  const supabase = await createClient();
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + WINDOW_DAYS);
  const horizonStr = horizon.toISOString().slice(0, 10);

  const { data } = await supabase
    .from('erp_goods_receipt_lines')
    .select(
      'id, quantity_received, batch_number, expiry_date, product:erp_products_catalog(code, name, name_ar), receipt:erp_goods_receipts(receipt_number, warehouse:erp_warehouses(code, name, name_ar))',
    )
    .not('expiry_date', 'is', null)
    .lte('expiry_date', horizonStr)
    .order('expiry_date', { ascending: true });

  const rows = (data as unknown as ExpiryRow[]) ?? [];
  const today = new Date().toISOString().slice(0, 10);

  function daysLeft(date: string) {
    return Math.ceil((new Date(date).getTime() - new Date(today).getTime()) / 86400000);
  }

  return (
    <div>
      <PageHeader
        title={t('inventory.expiryPageTitle')}
        description={t('inventory.expiryPageDescription', { days: WINDOW_DAYS })}
      />
      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('inventory.emptyExpiry')}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-right font-medium">{t('inventory.colProduct')}</th>
                    <th className="p-3 text-right font-medium">{t('inventory.colBatch')}</th>
                    <th className="p-3 text-right font-medium">{t('inventory.colWarehouse')}</th>
                    <th className="p-3 text-center font-medium">{t('inventory.colQuantity')}</th>
                    <th className="p-3 text-right font-medium">{t('inventory.colExpiryDate')}</th>
                    <th className="p-3 text-center font-medium">{t('inventory.colStatus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const d = daysLeft(r.expiry_date);
                    const expired = d < 0;
                    const soon = d >= 0 && d <= 30;
                    return (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-secondary/30">
                        <td className="p-3">
                          <span className="me-2 font-mono text-xs text-muted-foreground" dir="ltr">{r.product?.code}</span>
                          {r.product?.name_ar || r.product?.name || '—'}
                        </td>
                        <td className="p-3 font-mono text-xs" dir="ltr">{r.batch_number || '—'}</td>
                        <td className="p-3 text-muted-foreground">{r.receipt?.warehouse?.code ?? '—'}</td>
                        <td className="p-3 text-center tabular-nums" dir="ltr">{formatNumber(r.quantity_received)}</td>
                        <td className="p-3" dir="ltr">{formatDate(r.expiry_date)}</td>
                        <td className="p-3 text-center">
                          {expired ? (
                            <Badge variant="destructive">{t('inventory.statusExpired', { days: Math.abs(d) })}</Badge>
                          ) : soon ? (
                            <Badge variant="destructive">{t('inventory.statusExpiringSoon', { days: d })}</Badge>
                          ) : (
                            <Badge variant="warning">{t('inventory.statusExpiringDays', { days: d })}</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
