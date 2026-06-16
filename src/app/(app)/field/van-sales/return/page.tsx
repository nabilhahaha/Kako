import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { isVanSalesActive } from '@/lib/van-sales/settings-server';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { smartNextCustomerEnabled } from '@/lib/van-sales/sell';
import { ReturnScreen, type ReturnCustomer, type ReturnReason } from './return-screen';
import { isVanDayOpen } from '@/lib/van-sales/day-server';
import { DayClosedGate } from '../day-gate';
import { BackLink } from '@/components/shared/back-link';

export const dynamic = 'force-dynamic';

// Van Sales — accept a return back to the rep's van (Phase 3). Mobile-first,
// visit-anchored (?customer=). Gated by per-tenant enablement + field.sales.
// Pricing + stock are server-authoritative (erp_van_return); the reason is
// mandatory (per-company erp_return_reasons).
export default async function VanReturnPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) notFound();
  if (!hasPermission(ctx, 'field.sales') && !ctx.isSuperAdmin) redirect('/dashboard');

  const { t } = await getT();
  if (!(await isVanDayOpen(ctx.userId))) return <DayClosedGate title={t('vanSales.return.title')} />;
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
        <PageHeader title={t('vanSales.return.title')} description={t('vanSales.return.subtitle')} />
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t('vanSales.return.noVan')}</CardContent></Card>
      </div>
    );
  }

  const [custRes, reasonRes] = await Promise.all([
    supabase.from('erp_customers').select('id, name, name_ar, code').eq('branch_id', van.branch_id).order('name').limit(500),
    supabase.from('erp_return_reasons').select('id, code, label_en, label_ar').eq('is_active', true).order('sort'),
  ]);
  const smartNext = ctx.companyId ? smartNextCustomerEnabled(await getFeatureFlags(supabase, ctx.companyId)) : false;

  return (
    <div className="space-y-6">
      <BackLink href="/today" label={t('common.back')} />
      <PageHeader title={t('vanSales.return.title')} description={t('vanSales.return.subtitle')} />
      <ReturnScreen
        branchId={van.branch_id}
        customers={(custRes.data ?? []) as ReturnCustomer[]}
        reasons={(reasonRes.data ?? []) as ReturnReason[]}
        preselectCustomerId={preselectCustomer ?? null}
        smartNext={smartNext}
      />
    </div>
  );
}
