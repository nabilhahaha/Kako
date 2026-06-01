import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { PackageX } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { getT } from '@/lib/i18n/server';

interface PurchaseReturnRow {
  id: string;
  return_number: string;
  status: 'draft' | 'approved' | 'completed' | 'cancelled';
  total_amount: number;
  reason: string | null;
  created_at: string;
  supplier: { name: string; name_ar: string | null } | null;
}

const STATUS_VARIANT = {
  draft: 'secondary', approved: 'info', completed: 'success', cancelled: 'destructive',
} as const;

export default async function SupplierReturnsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'purchasing.return')) redirect('/dashboard');

  const { t, locale } = await getT();
  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_purchase_returns')
    .select('id, return_number, status, total_amount, reason, created_at, supplier:erp_suppliers(name, name_ar)')
    .order('created_at', { ascending: false })
    .limit(500);
  const rows = (data as unknown as PurchaseReturnRow[]) ?? [];

  return (
    <div>
      <PageHeader title={t('electrical.supplierReturnsTitle')} description={t('electrical.supplierReturnsDescription')} />
      {rows.length === 0 ? (
        <EmptyState icon={<PackageX />} title={t('electrical.supplierReturnsEmpty')} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('electrical.colReturnNumber')}</th>
                    <th className="p-3 text-start font-medium">{t('electrical.colSupplier')}</th>
                    <th className="p-3 text-start font-medium">{t('electrical.colReason')}</th>
                    <th className="p-3 text-end font-medium">{t('electrical.colAmount')}</th>
                    <th className="p-3 text-start font-medium">{t('electrical.colStatus')}</th>
                    <th className="p-3 text-start font-medium">{t('electrical.colCreated')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="p-3 font-medium" dir="ltr">{r.return_number}</td>
                      <td className="p-3">{r.supplier ? (locale === 'ar' ? r.supplier.name_ar || r.supplier.name : r.supplier.name) : '—'}</td>
                      <td className="p-3 text-muted-foreground">{r.reason ?? '—'}</td>
                      <td className="p-3 text-end tabular-nums" dir="ltr">{formatCurrency(r.total_amount)}</td>
                      <td className="p-3"><Badge variant={STATUS_VARIANT[r.status]}>{t(`electrical.return${r.status.charAt(0).toUpperCase()}${r.status.slice(1)}`)}</Badge></td>
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
