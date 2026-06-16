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

// Van Sales — salesman stock (load) request. The screen now shows EVERY active SKU
// with the full picture so the rep can decide: Van Balance · Pending (upcoming
// load) · Warehouse Available (permission-gated) · Requested Qty. Submitting starts
// the configurable approval chain.
export default async function VanSalesRequestPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) notFound();
  if (!hasPermission(ctx, 'field.sales') && !ctx.isSuperAdmin) redirect('/dashboard');

  const { t } = await getT();
  const canViewStock = hasPermission(ctx, 'stock.view') || hasPermission(ctx, 'inventory.view') || ctx.isSuperAdmin;

  const [vanRes, whRes, prodRes] = await Promise.all([
    supabase.from('erp_warehouses').select('id, name, name_ar').eq('is_van', true).eq('assigned_to', ctx.userId).eq('is_active', true).maybeSingle(),
    supabase.from('erp_warehouses').select('id, name, name_ar, is_van').eq('is_active', true).order('name').limit(100),
    supabase.from('erp_products_catalog').select('id, name, name_ar, code').eq('is_active', true).order('name').limit(1000),
  ]);
  const van = (vanRes.data as WarehouseOpt | null) ?? null;
  const warehouses = (whRes.data ?? []) as WarehouseOpt[];
  const products = (prodRes.data ?? []) as ProductOpt[];

  // Van balance · warehouse stock (van + candidate sources) · pending (upcoming) load.
  const vanBalance: Record<string, number> = {};
  const warehouseStock: Record<string, Record<string, number>> = {};
  const pending: Record<string, number> = {};
  if (van) {
    const whIds = [van.id, ...warehouses.filter((w) => w.id !== van.id).map((w) => w.id)];
    const [{ data: stockRows }, { data: pendReqs }] = await Promise.all([
      supabase.from('erp_inventory_stock').select('warehouse_id, product_id, quantity').in('warehouse_id', whIds).limit(20000),
      supabase.from('erp_stock_requests').select('id').eq('to_warehouse_id', van.id).eq('status', 'pending').limit(200),
    ]);
    for (const s of (stockRows ?? []) as { warehouse_id: string; product_id: string; quantity: number | null }[]) {
      const q = Number(s.quantity ?? 0);
      if (s.warehouse_id === van.id) vanBalance[s.product_id] = q;
      (warehouseStock[s.warehouse_id] ??= {})[s.product_id] = q;
    }
    const reqIds = ((pendReqs ?? []) as { id: string }[]).map((r) => r.id);
    if (reqIds.length > 0) {
      const { data: pendLines } = await supabase.from('erp_stock_request_lines').select('product_id, quantity').in('request_id', reqIds);
      for (const l of (pendLines ?? []) as { product_id: string; quantity: number | null }[]) pending[l.product_id] = (pending[l.product_id] ?? 0) + Number(l.quantity ?? 0);
    }
  }

  return (
    <div className="space-y-6">
      <BackLink href="/field/van-sales/requests" home="/today" label={t('common.back')} />
      <PageHeader title={t('vanSales.request.title')} description={t('vanSales.request.subtitle')} />
      {!van ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t('vanSales.request.noVan')}</CardContent></Card>
      ) : (
        <StockRequestForm
          van={van}
          warehouses={warehouses}
          products={products}
          vanBalance={vanBalance}
          warehouseStock={warehouseStock}
          pending={pending}
          canViewStock={canViewStock}
        />
      )}
    </div>
  );
}
