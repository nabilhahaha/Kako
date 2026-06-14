import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { isVanSalesActive } from '@/lib/van-sales/settings-server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { loadCustomerStatement } from '@/lib/erp/customer-statement-server';
import { CustomerStatementView } from '@/components/customers/customer-statement';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

// Salesman-facing customer statement (mobile). Same authoritative builder +
// component as the desktop customer page; branch-scoped by RLS, gated by
// field.sales. Collect Now routes to the van collect flow for this customer.
export default async function VanStatementPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) notFound();
  if (!hasPermission(ctx, 'field.sales') && !ctx.isSuperAdmin) redirect('/dashboard');

  const { id } = await params;
  const { t } = await getT();

  const res = await loadCustomerStatement(supabase, id);
  if (!res) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-10">
      <BackLink href="/field/van-sales" label={t('vanSales.sell.back')} />
      <PageHeader
        title={t('customers.stmtTitle', { name: res.customer.name_ar || res.customer.name })}
        description={res.customer.code}
      />
      <CustomerStatementView
        statement={res.statement}
        printHref={`/print/statement/${id}`}
        collectHref={`/field/van-sales/collect?customer=${id}`}
        sellHref={`/field/van-sales/sell?customer=${id}`}
        returnHref={`/field/van-sales/return?customer=${id}`}
        canCollect={hasPermission(ctx, 'sales.collect') || ctx.isSuperAdmin}
      />
    </div>
  );
}
