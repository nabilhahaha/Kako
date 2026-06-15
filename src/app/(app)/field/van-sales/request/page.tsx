import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { isVanSalesActive } from '@/lib/van-sales/settings-server';
import { StockRequestForm, type WarehouseOpt, type ProductOpt } from './request-form';

export const dynamic = 'force-dynamic';

// Van Sales — salesman stock (load) request screen. Gated by the per-tenant
// enablement (platform flag AND company toggle) + field.sales. Submitting starts
// the configurable approval chain (request-actions → workflow engine).
export default async function VanSalesRequestPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) notFound();
  if (!hasPermission(ctx, 'field.sales') && !ctx.isSuperAdmin) redirect('/dashboard');

  const { t } = await getT();
  const [vanRes, whRes, prodRes] = await Promise.all([
    supabase.from('erp_warehouses').select('id, name, name_ar').eq('is_van', true).eq('assigned_to', ctx.userId).eq('is_active', true).maybeSingle(),
    supabase.from('erp_warehouses').select('id, name, name_ar, is_van').eq('is_active', true).order('name').limit(100),
    supabase.from('erp_products_catalog').select('id, name, name_ar, code').eq('is_active', true).order('name').limit(500),
  ]);
  const van = (vanRes.data as WarehouseOpt | null) ?? null;
  const warehouses = (whRes.data ?? []) as WarehouseOpt[];
  const products = (prodRes.data ?? []) as ProductOpt[];

  return (
    <div className="space-y-6">
      <BackLink href="/field/van-sales/requests" home="/today" label={t('common.back')} />
      <PageHeader title={t('vanSales.request.title')} description={t('vanSales.request.subtitle')} />
      {!van ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t('vanSales.request.noVan')}</CardContent></Card>
      ) : (
        <StockRequestForm van={van} warehouses={warehouses} products={products} />
      )}
    </div>
  );
}
