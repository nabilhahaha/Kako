import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import { getT } from '@/lib/i18n/server';

interface WarrantyRow {
  id: string;
  start_date: string;
  period_months: number;
  end_date: string;
  is_void: boolean;
  product: { code: string; name: string; name_ar: string | null } | null;
  serial: { serial_no: string } | null;
  customer: { name: string; name_ar: string | null } | null;
}

export default async function WarrantiesPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'electrical.rma')) redirect('/dashboard');

  const { t, locale } = await getT();
  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_warranties')
    .select('id, start_date, period_months, end_date, is_void, product:erp_products_catalog(code, name, name_ar), serial:erp_product_serials(serial_no), customer:erp_customers(name, name_ar)')
    .order('end_date', { ascending: true })
    .limit(500);
  const rows = (data as unknown as WarrantyRow[]) ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const statusOf = (r: WarrantyRow) => r.is_void ? 'void' : (r.end_date >= today ? 'active' : 'expired');

  return (
    <div>
      <PageHeader title={t('electrical.warrantyTitle')} description={t('electrical.warrantyDescription')} />
      {rows.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('electrical.warrantyEmpty')}</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('electrical.colProduct')}</th>
                    <th className="p-3 text-start font-medium">{t('electrical.colSerial')}</th>
                    <th className="p-3 text-start font-medium">{t('electrical.colCustomer')}</th>
                    <th className="p-3 text-start font-medium">{t('electrical.colStart')}</th>
                    <th className="p-3 text-end font-medium">{t('electrical.colPeriod')}</th>
                    <th className="p-3 text-start font-medium">{t('electrical.colEnd')}</th>
                    <th className="p-3 text-start font-medium">{t('electrical.colStatus')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => {
                    const st = statusOf(r);
                    return (
                      <tr key={r.id} className="hover:bg-muted/30">
                        <td className="p-3">{r.product ? (locale === 'ar' ? r.product.name_ar || r.product.name : r.product.name) : '—'}</td>
                        <td className="p-3" dir="ltr">{r.serial?.serial_no ?? '—'}</td>
                        <td className="p-3">{r.customer ? (locale === 'ar' ? r.customer.name_ar || r.customer.name : r.customer.name) : '—'}</td>
                        <td className="p-3" dir="ltr">{formatDate(r.start_date)}</td>
                        <td className="p-3 text-end tabular-nums" dir="ltr">{r.period_months}</td>
                        <td className="p-3" dir="ltr">{formatDate(r.end_date)}</td>
                        <td className="p-3"><Badge variant={st === 'active' ? 'success' : st === 'expired' ? 'destructive' : 'secondary'}>{t(`electrical.warranty${st.charAt(0).toUpperCase()}${st.slice(1)}`)}</Badge></td>
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
