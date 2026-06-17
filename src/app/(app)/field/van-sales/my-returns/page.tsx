import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { isVanSalesActive } from '@/lib/van-sales/settings-server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { loadMyReturns } from '@/lib/van-sales/returns-server';
import { MyReturnsView } from './my-returns-view';

export const dynamic = 'force-dynamic';

// Salesman "My Returns": the rep's own return requests by status (Pending /
// Approved / Rejected) with approver + decision date, rejection reasons, and
// drill-down. Gated by returns.create; branch-scoped by RLS.
export default async function MyReturnsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) notFound();
  if (!hasPermission(ctx, 'returns.create') && !ctx.isSuperAdmin) redirect('/dashboard');

  const { t } = await getT();
  const res = await loadMyReturns();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <BackLink href="/today" home="/today" label={t('common.back')} />
      <PageHeader title={t('vanSales.myReturns.title')} description={t('vanSales.myReturns.subtitle')} />
      {!res.ok ? (
        <Card><CardContent className="pt-6 text-sm text-destructive">{res.error}</CardContent></Card>
      ) : (
        <MyReturnsView rows={res.data ?? []} />
      )}
    </div>
  );
}
