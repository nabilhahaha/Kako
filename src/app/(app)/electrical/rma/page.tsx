import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import { getT } from '@/lib/i18n/server';

interface RmaRow {
  id: string;
  rma_number: string;
  reason: string | null;
  status: 'requested' | 'approved' | 'received' | 'repair' | 'replace' | 'refund' | 'closed' | 'rejected';
  resolution: string | null;
  created_at: string;
  product: { name: string; name_ar: string | null } | null;
  serial: { serial_no: string } | null;
  customer: { name: string; name_ar: string | null } | null;
}

const STATUS_VARIANT = {
  requested: 'secondary', approved: 'info', received: 'info', repair: 'warning',
  replace: 'warning', refund: 'warning', closed: 'success', rejected: 'destructive',
} as const;

export default async function RmaPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'electrical.rma')) redirect('/dashboard');

  const { t, locale } = await getT();
  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_rma')
    .select('id, rma_number, reason, status, resolution, created_at, product:erp_products_catalog(name, name_ar), serial:erp_product_serials(serial_no), customer:erp_customers(name, name_ar)')
    .order('created_at', { ascending: false })
    .limit(500);
  const rows = (data as unknown as RmaRow[]) ?? [];

  return (
    <div>
      <PageHeader title={t('electrical.rmaTitle')} description={t('electrical.rmaDescription')} />
      {rows.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('electrical.rmaEmpty')}</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('electrical.colRma')}</th>
                    <th className="p-3 text-start font-medium">{t('electrical.colCustomer')}</th>
                    <th className="p-3 text-start font-medium">{t('electrical.colProduct')}</th>
                    <th className="p-3 text-start font-medium">{t('electrical.colSerial')}</th>
                    <th className="p-3 text-start font-medium">{t('electrical.colReason')}</th>
                    <th className="p-3 text-start font-medium">{t('electrical.colStatus')}</th>
                    <th className="p-3 text-start font-medium">{t('electrical.colCreated')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="p-3 font-medium" dir="ltr">{r.rma_number}</td>
                      <td className="p-3">{r.customer ? (locale === 'ar' ? r.customer.name_ar || r.customer.name : r.customer.name) : '—'}</td>
                      <td className="p-3">{r.product ? (locale === 'ar' ? r.product.name_ar || r.product.name : r.product.name) : '—'}</td>
                      <td className="p-3" dir="ltr">{r.serial?.serial_no ?? '—'}</td>
                      <td className="p-3 text-muted-foreground">{r.reason ?? '—'}</td>
                      <td className="p-3"><Badge variant={STATUS_VARIANT[r.status]}>{t(`electrical.rma${r.status.charAt(0).toUpperCase()}${r.status.slice(1)}`)}</Badge></td>
                      <td className="p-3" dir="ltr">{formatDate(r.created_at)}</td>
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
