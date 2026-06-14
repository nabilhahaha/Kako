import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { isVanSalesActive } from '@/lib/van-sales/settings-server';
import { CollectScreen, type CollectCustomer } from './collect-screen';
import { isVanDayOpen } from '@/lib/van-sales/day-server';
import { DayClosedGate } from '../day-gate';

export const dynamic = 'force-dynamic';

// Van Sales — collect cash against outstanding invoices (Phase 5). Mobile-first,
// visit-anchored (?customer=). Pick a customer, see what's owed, settle one
// receipt across many invoices (auto oldest-first or per-invoice). Gated by the
// per-tenant enablement + field.sales. Allocation + balance are server-
// authoritative (erp_settle_collection).
export default async function VanCollectPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) notFound();
  if (!hasPermission(ctx, 'field.sales') && !ctx.isSuperAdmin) redirect('/dashboard');

  const { t } = await getT();
  if (!(await isVanDayOpen(ctx.userId))) return <DayClosedGate title={t('vanSales.collect.title')} />;
  const { customer: preselectCustomer } = await searchParams;

  const { data: vanRow } = await supabase
    .from('erp_warehouses')
    .select('id, branch_id')
    .eq('is_van', true).eq('assigned_to', ctx.userId).eq('is_active', true)
    .order('code').limit(1).maybeSingle();
  const van = vanRow as { id: string; branch_id: string } | null;

  if (!van) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('vanSales.collect.title')} description={t('vanSales.collect.subtitle')} />
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t('vanSales.collect.noVan')}</CardContent></Card>
      </div>
    );
  }

  const { data: custData } = await supabase
    .from('erp_customers')
    .select('id, name, name_ar, code, balance')
    .eq('branch_id', van.branch_id)
    .order('name').limit(500);

  return (
    <div className="space-y-6">
      <PageHeader title={t('vanSales.collect.title')} description={t('vanSales.collect.subtitle')} />
      <CollectScreen
        branchId={van.branch_id}
        customers={(custData ?? []) as CollectCustomer[]}
        preselectCustomerId={preselectCustomer ?? null}
      />
    </div>
  );
}
