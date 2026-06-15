import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { isVanSalesActive } from '@/lib/van-sales/settings-server';
import { loadVanReports } from '@/lib/van-sales/reports-server';

export const dynamic = 'force-dynamic';

const pctLabel = (n: number) => `${Math.round(n * 100)}%`;

// Van Sales — load reports (read-only). Requested vs approved vs received +
// service level, computed by the pure reporting core. Gated per-tenant +
// field.sales/stock.adjust.
export default async function VanSalesReportsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) notFound();
  if (!hasPermission(ctx, 'field.sales') && !hasPermission(ctx, 'stock.adjust') && !ctx.isSuperAdmin) redirect('/dashboard');

  const { t } = await getT();
  const { overall, reports } = await loadVanReports(supabase);

  return (
    <div className="space-y-6">
      <BackLink href="/field/van-sales" home="/today" label={t('common.back')} />
      <PageHeader title={t('vanSales.reports.title')} description={t('vanSales.reports.subtitle')} />

      {/* Overall service level */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{pctLabel(overall.receivedFillRate)}</div><div className="text-sm text-muted-foreground">{t('vanSales.reports.fillRate')}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{pctLabel(overall.deliveryAccuracy)}</div><div className="text-sm text-muted-foreground">{t('vanSales.reports.deliveryAccuracy')}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{overall.netVariance}</div><div className="text-sm text-muted-foreground">{t('vanSales.reports.variance')}</div></CardContent></Card>
      </div>

      {reports.length === 0 ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t('vanSales.reports.none')}</CardContent></Card>
      ) : (
        <Card><CardContent className="pt-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs text-muted-foreground">
                <th className="py-2 text-start font-medium">{t('vanSales.reports.manifest')}</th>
                <th className="py-2 text-end font-medium">{t('vanSales.reports.requested')}</th>
                <th className="py-2 text-end font-medium">{t('vanSales.reports.approved')}</th>
                <th className="py-2 text-end font-medium">{t('vanSales.reports.received')}</th>
                <th className="py-2 text-end font-medium">{t('vanSales.reports.variance')}</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.confirmationId} className="border-b border-border last:border-0">
                  <td className="py-2">{r.manifestNumber ?? r.confirmationId.slice(0, 8)}</td>
                  <td className="py-2 text-end">{r.service.requestedTotal}</td>
                  <td className="py-2 text-end">{r.service.approvedTotal}</td>
                  <td className="py-2 text-end">{r.service.receivedTotal}</td>
                  <td className="py-2 text-end">{r.service.netVariance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}
    </div>
  );
}
