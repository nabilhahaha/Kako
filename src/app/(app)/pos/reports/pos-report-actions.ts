'use server';

// Fast Food / Restaurant POS — reports (read-only). Aggregates CLOSED restaurant orders +
// their items for the period. Gated reports.view OR restaurant.manage so admin/manager/
// cashier (ops) AND supervisor/viewer (reporting) can all see it. Company-scoped (RLS).

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasAnyPermission } from '@/lib/erp/permissions';
import {
  summarize, groupOrders, groupItems, hourly, topItems,
  type RepOrder, type RepItem, type RepSummary, type Bucket, type ItemBucket,
} from './pos-report';

export type PosPeriod = 'today' | 'week' | 'month';
export interface PosReportData {
  summary: RepSummary;
  byCashier: Bucket[];
  byPayment: Bucket[];
  byMode: Bucket[];
  byProduct: ItemBucket[];
  byCategory: ItemBucket[];
  hourly: Bucket[];
  top: ItemBucket[];
}
type ResultD<T> = { ok: true; data: T } | { ok: false; error: string };

function periodStart(period: PosPeriod): string {
  const d = new Date();
  if (period === 'today') d.setHours(0, 0, 0, 0);
  else if (period === 'week') d.setDate(d.getDate() - 7);
  else d.setDate(d.getDate() - 30);
  return d.toISOString();
}

export async function getPosReport(period: PosPeriod = 'today'): Promise<ResultD<PosReportData>> {
  const ctx = await getUserContext();
  if (!ctx?.companyId) return { ok: false, error: 'err_unauthorized' };
  if (!hasAnyPermission(ctx, ['reports.view', 'restaurant.manage'])) return { ok: false, error: 'err_forbidden' };
  const sb = await createClient();
  const from = periodStart(period);

  const { data: orders, error } = await sb.from('erp_restaurant_orders')
    .select('id, total, payment_method, order_type, created_by, closed_at')
    .eq('company_id', ctx.companyId).eq('status', 'closed').gte('closed_at', from)
    .order('closed_at', { ascending: false }).limit(20000);
  if (error) return { ok: false, error: error.message };
  const orderIds = (orders ?? []).map((o) => o.id as string);

  // items for those orders (chunked .in to stay under URL limits)
  const rawItems: Record<string, unknown>[] = [];
  for (let i = 0; i < orderIds.length; i += 400) {
    const chunk = orderIds.slice(i, i + 400);
    const { data } = await sb.from('erp_restaurant_order_items')
      .select('order_id, name, qty, price, product_id').eq('company_id', ctx.companyId).in('order_id', chunk);
    for (const r of data ?? []) rawItems.push(r);
  }

  // product → category name
  const productIds = [...new Set(rawItems.map((r) => r.product_id as string | null).filter((x): x is string => !!x))];
  const catByProduct = new Map<string, string>();
  if (productIds.length) {
    const { data: prods } = await sb.from('erp_products_catalog').select('id, category_id').in('id', productIds);
    const catIds = [...new Set((prods ?? []).map((p) => p.category_id as string | null).filter((x): x is string => !!x))];
    const catName = new Map<string, string>();
    if (catIds.length) {
      const { data: cats } = await sb.from('erp_product_categories').select('id, name').in('id', catIds);
      for (const c of cats ?? []) catName.set(c.id as string, (c.name as string) ?? '');
    }
    for (const p of prods ?? []) { const cid = p.category_id as string | null; if (cid) catByProduct.set(p.id as string, catName.get(cid) ?? ''); }
  }

  // cashier names
  const cashierIds = [...new Set((orders ?? []).map((o) => o.created_by as string | null).filter((x): x is string => !!x))];
  const cashierName = new Map<string, string>();
  if (cashierIds.length) {
    const { data: profs } = await sb.from('erp_profiles').select('id, full_name, email').in('id', cashierIds);
    for (const p of profs ?? []) cashierName.set(p.id as string, (p.full_name as string) || (p.email as string) || (p.id as string));
  }

  const repOrders: RepOrder[] = (orders ?? []).map((o) => ({
    id: o.id as string, total: Number(o.total ?? 0),
    paymentMethod: (o.payment_method as string) ?? 'cash', orderType: (o.order_type as string) ?? 'takeaway',
    cashierId: (o.created_by as string | null) ?? null,
    cashierName: o.created_by ? (cashierName.get(o.created_by as string) ?? null) : null,
    closedAt: (o.closed_at as string | null) ?? null,
  }));
  const repItems: RepItem[] = rawItems.map((r) => ({
    orderId: r.order_id as string, name: (r.name as string) ?? '', qty: Number(r.qty ?? 0), price: Number(r.price ?? 0),
    categoryName: r.product_id ? (catByProduct.get(r.product_id as string) ?? null) : null,
  }));

  return {
    ok: true,
    data: {
      summary: summarize(repOrders, repItems),
      byCashier: groupOrders(repOrders, (o) => o.cashierId ?? '—', (k) => repOrders.find((o) => (o.cashierId ?? '—') === k)?.cashierName ?? '—'),
      byPayment: groupOrders(repOrders, (o) => o.paymentMethod, (k) => k),
      byMode: groupOrders(repOrders, (o) => o.orderType, (k) => k),
      byProduct: groupItems(repItems, (i) => i.name, (k) => k),
      byCategory: groupItems(repItems, (i) => i.categoryName ?? '—', (k) => k),
      hourly: hourly(repOrders),
      top: topItems(repItems, 10),
    },
  };
}
