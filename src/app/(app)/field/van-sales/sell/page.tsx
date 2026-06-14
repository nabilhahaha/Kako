import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { isVanSalesActive, loadVanSalesSettings } from '@/lib/van-sales/settings-server';
import { MOBILE_ENABLED } from '@/lib/offline-sync';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { multiUomEnabled } from '@/lib/erp/uom';
import { collectInSellEnabled } from '@/lib/van-sales/sell';
import { loadProductUnitsMany } from '@/lib/erp/uom-server';
import { SellScreen, type SellCustomer, type SellProduct } from './sell-screen';

export const dynamic = 'force-dynamic';

// Van Sales — sell off the van (Phase 2). Mobile-first, visit-anchored:
// Customer → Products → Review → Issue → Print/Share. Gated by the per-tenant
// enablement (platform flag AND company toggle) + field.sales. Pricing is
// server-authoritative (preview + issue both resolve via erp_resolve_price); the
// screen never sets a price. Discounts respect sales.discount + the company cap.
export default async function VanSellPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) notFound();
  if (!hasPermission(ctx, 'field.sales') && !ctx.isSuperAdmin) redirect('/dashboard');

  const { t } = await getT();
  const { customer: preselectCustomer } = await searchParams;

  // The rep's own active van — the sale's source and branch.
  const { data: vanRow } = await supabase
    .from('erp_warehouses')
    .select('id, branch_id')
    .eq('is_van', true).eq('assigned_to', ctx.userId).eq('is_active', true)
    .order('code').limit(1).maybeSingle();
  const van = vanRow as { id: string; branch_id: string } | null;

  if (!van) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('vanSales.sell.title')} description={t('vanSales.sell.subtitle')} />
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t('vanSales.sell.noVan')}</CardContent></Card>
      </div>
    );
  }

  const settings = await loadVanSalesSettings(supabase, ctx.companyId!);

  // Van stock per SKU + customers for this branch (a van pilot is a single rep on
  // one branch). Stock drives the per-SKU availability badges.
  const [stockRes, custRes] = await Promise.all([
    supabase
      .from('erp_inventory_stock')
      .select('product_id, quantity, reserved_qty, product:erp_products_catalog(id, name, name_ar, code, is_active)')
      .eq('warehouse_id', van.id),
    supabase
      .from('erp_customers')
      .select('id, name, name_ar, code, balance, credit_limit, payment_terms_days, credit_control_enabled')
      .eq('branch_id', van.branch_id)
      .order('name').limit(500),
  ]);

  // Credit-control aging: oldest still-unpaid invoice per customer in this branch
  // (drives the overdue badge + the in-sell credit block). One grouped read; only
  // customers with open invoices appear.
  const { data: openInv } = await supabase
    .from('erp_invoices')
    .select('customer_id, created_at, net_amount, paid_amount, status')
    .eq('branch_id', van.branch_id)
    .in('status', ['issued', 'partially_paid', 'overdue']);
  const oldestUnpaid = new Map<string, string>();
  for (const r of (openInv ?? []) as { customer_id: string; created_at: string; net_amount: number; paid_amount: number }[]) {
    if (Number(r.net_amount ?? 0) - Number(r.paid_amount ?? 0) <= 0) continue;
    const d = String(r.created_at).slice(0, 10);
    const prev = oldestUnpaid.get(r.customer_id);
    if (!prev || d < prev) oldestUnpaid.set(r.customer_id, d);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const products: SellProduct[] = ((stockRes.data ?? []) as any[])
    .filter((r) => r.product && r.product.is_active)
    .map((r) => ({
      id: r.product.id as string,
      name: r.product.name as string,
      name_ar: (r.product.name_ar ?? null) as string | null,
      code: r.product.code as string,
      available: Number(r.quantity ?? 0) - Number(r.reserved_qty ?? 0),
    }));
  const customers = ((custRes.data ?? []) as SellCustomer[]).map((c) => ({
    ...c, oldest_unpaid_date: oldestUnpaid.get(c.id) ?? null,
  }));

  // U3: when multi-UoM is enabled, attach each product's sellable units (base +
  // alternates) for the per-line UoM picker. Respects sell_mode ('base' = base only).
  const flags = await getFeatureFlags(supabase, ctx.companyId!);
  const multiUom = multiUomEnabled(flags);
  // Collection-in-Sell: show the Payment step only when the flag is ON. A rep with
  // sales.collect may enter tenders; otherwise the step is credit-only.
  const collectInSell = collectInSellEnabled(flags);
  const canCollect = hasPermission(ctx, 'sales.collect') || ctx.isSuperAdmin;
  if (multiUom && products.length > 0) {
    const cfgs = await loadProductUnitsMany(supabase, products.map((p) => p.id));
    for (const p of products) {
      const cfg = cfgs.get(p.id);
      if (!cfg) continue;
      p.units = cfg.rules.sellMode === 'base'
        ? [{ uom: cfg.units.base, factor: 1 }]
        : cfg.units.units.map((u) => ({ uom: u.uom, factor: u.factor }));
      p.defaultSellUom = cfg.units.sales ?? null;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('vanSales.sell.title')} description={t('vanSales.sell.subtitle')} />
      <SellScreen
        branchId={van.branch_id}
        customers={customers}
        products={products}
        preselectCustomerId={preselectCustomer ?? null}
        discountCapPct={settings.discountCapPct}
        canDiscount={hasPermission(ctx, 'sales.discount') || ctx.isSuperAdmin}
        offlineEnabled={MOBILE_ENABLED()}
        multiUom={multiUom}
        collectInSell={collectInSell}
        canCollect={canCollect}
      />
    </div>
  );
}
