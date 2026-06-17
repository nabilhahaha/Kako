import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { isVanSalesActive } from '@/lib/van-sales/settings-server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { loadStatementHub } from '@/lib/van-sales/customers-server';
import { StatementHubView } from './statement-hub-view';

export const dynamic = 'force-dynamic';

// Customer Statement hub = a field collection center reachable from Today (no
// visit needed): search + collection-priority sort + quick filters, with each
// customer's balance / overdue / oldest due / credit limit and quick actions
// (open statement, start collection, print, share PDF, profile). Branch-scoped by
// RLS; gated by field.sales. Credit limit is permission-controlled.
export default async function VanStatementSearchPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) notFound();
  if (!hasPermission(ctx, 'field.sales') && !ctx.isSuperAdmin) redirect('/dashboard');

  const { t } = await getT();
  const hub = await loadStatementHub(ctx);
  // Financial visibility is permission-controlled (R2/R3): credit limit and balance
  // are now distinct, grantable permissions separate from customers.manage.
  const canViewCreditLimit = hasPermission(ctx, 'customers.view_credit') || ctx.isSuperAdmin;
  const canViewBalance = hasPermission(ctx, 'customers.view_balance') || ctx.isSuperAdmin;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <BackLink href="/today" home="/today" label={t('common.back')} />
      <PageHeader title={t('vanSales.statementTile')} description={t('vanSales.statementSearch.subtitle')} />
      {!hub ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t('vanSales.sell.noVan')}</CardContent></Card>
      ) : (
        <StatementHubView customers={hub.customers} canViewCreditLimit={canViewCreditLimit} canViewBalance={canViewBalance} />
      )}
    </div>
  );
}
