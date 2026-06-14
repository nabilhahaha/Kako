import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { isVanSalesActive } from '@/lib/van-sales/settings-server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { loadVanCustomerPicker } from '@/lib/van-sales/customers-server';
import { CustomerPicker } from './customer-picker';

export const dynamic = 'force-dynamic';

// F1: customer-first entry for the salesman. Pick a customer → the statement
// (visit context) for that customer, from which Collect / Sell / Return / Print
// branch. Branch-scoped by RLS; gated by field.sales. Read-only (no master-data).
export default async function VanCustomersPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) notFound();
  if (!hasPermission(ctx, 'field.sales') && !ctx.isSuperAdmin) redirect('/dashboard');

  const { t } = await getT();

  const picker = await loadVanCustomerPicker(ctx);

  if (!picker) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <BackLink href="/field/van-sales" label={t('vanSales.sell.back')} />
        <PageHeader title={t('vanSales.steps.customer')} description={t('vanSales.pickerSubtitle')} />
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t('vanSales.sell.noVan')}</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <BackLink href="/field/van-sales" label={t('vanSales.sell.back')} />
      <PageHeader title={t('vanSales.steps.customer')} description={t('vanSales.pickerSubtitle')} />
      <CustomerPicker customers={picker.customers} />
    </div>
  );
}
