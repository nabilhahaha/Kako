import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { stockMovementReportEnabled } from '@/lib/van-sales/sell';
import { loadStockMovementReport } from '@/lib/van-sales/stock-movement-server';
import { BackLink } from '@/components/shared/back-link';
import { PageHeader } from '@/components/shared/page-header';
import { buttonVariants } from '@/components/ui/button';
import { getT } from '@/lib/i18n/server';
import { Printer } from 'lucide-react';
import { StockMovementTable } from './stock-movement-table';

export const dynamic = 'force-dynamic';

// Van stock-movement report — explains WHY the current balance is what it is
// (Opening + Load − Sales + Saleable Return − Damage Return − Expiry ± Adjustments
// = Current), per SKU, with totals, search, print and per-SKU drill-down. A
// salesman sees their own van; a supervisor (reports.view) can view any rep via ?rep=.
export default async function StockMovementReportPage({ searchParams }: { searchParams: Promise<{ rep?: string; date?: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date || '') ? sp.date! : new Date().toISOString().slice(0, 10);
  const self = !sp.rep || sp.rep === ctx.userId;
  const repId = self ? ctx.userId : sp.rep!;

  const canSelf = hasPermission(ctx, 'field.sales') || hasPermission(ctx, 'inventory.view') || ctx.isSuperAdmin;
  const canOther = hasPermission(ctx, 'reports.view') || hasPermission(ctx, 'inventory.view') || ctx.isSuperAdmin;
  if (self ? !canSelf : !canOther) redirect('/dashboard');

  const flags = ctx.companyId ? await getFeatureFlags(supabase, ctx.companyId) : null;
  if (!stockMovementReportEnabled(flags)) notFound();

  const { t, locale } = await getT();
  const report = await loadStockMovementReport(supabase, repId, date, locale);

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-10">
      <BackLink href="/field/stock" label={t('common.back')} />
      <PageHeader
        title={t('vanSales.stockMove.title')}
        description={report.warehouseName ? `${t('vanSales.stockMove.subtitle')} — ${report.warehouseName}` : t('vanSales.stockMove.subtitle')}
        action={
          <a href={`/print/stock-movements?date=${date}${self ? '' : `&rep=${repId}`}`} target="_blank" rel="noreferrer" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
            <Printer className="h-4 w-4" /> {t('vanSales.stockMove.print')}
          </a>
        }
      />
      {!report.warehouseId ? (
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{t('vanSales.stockMove.noVan')}</p>
      ) : (
        <>
          <StockMovementTable rows={report.rows} totals={report.totals} detailBase="/field/stock/movements" />
          <p className="text-[11px] text-muted-foreground">{t('vanSales.stockMove.formula')}</p>
          <p className="text-[11px] text-muted-foreground">{t('vanSales.stockMove.pendingNote')}</p>
        </>
      )}
    </div>
  );
}
