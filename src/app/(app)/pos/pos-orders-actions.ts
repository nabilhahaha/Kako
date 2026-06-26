'use server';

// Fast Food / Restaurant POS — Orders list + Shift summary (read-only, additive). Both read the
// immutable ZATCA-ready ledger erp_pos_invoices (company-scoped via RLS) — no new tables, no
// writes, no impact on checkout/offline/scan. Used by the cashier-visible /pos/orders and
// /pos/shift screens in the dedicated POS shell.

import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/erp/guards';

type ResultD<T> = { ok: true; data: T } | { ok: false; error: string };

export interface PosOrderRow {
  id: string;
  invoiceNumber: string;
  issueAt: string;
  orderType: string | null;
  paymentMethod: string | null;
  status: string;
  docType: string;
  grandTotal: number;
}

/** Recent POS invoices for the company (newest first). Cashier-accessible (restaurant.manage).
 *  Company-scoped via RLS; capped so the list stays fast on a busy outlet. */
export async function getPosRecentOrders(limit = 50): Promise<ResultD<PosOrderRow[]>> {
  const ctx = await requirePermission('restaurant.manage');
  if (!ctx.companyId) return { ok: false, error: 'err_no_company' };
  const sb = await createClient();
  const { data, error } = await sb.from('erp_pos_invoices')
    .select('id, invoice_number, issue_at, order_type, payment_method, status, doc_type, grand_total')
    .eq('company_id', ctx.companyId)
    .order('issue_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: r.id as string,
      invoiceNumber: (r.invoice_number as string) ?? '',
      issueAt: (r.issue_at as string) ?? '',
      orderType: (r.order_type as string | null) ?? null,
      paymentMethod: (r.payment_method as string | null) ?? null,
      status: (r.status as string) ?? 'issued',
      docType: (r.doc_type as string) ?? 'invoice',
      grandTotal: Number(r.grand_total ?? 0),
    })),
  };
}

export interface PosShiftSummary {
  cashierName: string;
  sinceIso: string;
  orders: number;
  revenue: number;
  itemsSold: number;
  avgTicket: number;
  byMethod: { method: string; orders: number; revenue: number }[];
  byMode: { mode: string; orders: number; revenue: number }[];
}

/** Today's sales for the CURRENT cashier (created_by = the signed-in user), since local midnight.
 *  Only issued invoices count toward revenue; voided/credit-note rows are excluded. Items sold is
 *  summed from the invoice payload lines. Read-only, company-scoped (RLS). */
export async function getPosShiftSummary(): Promise<ResultD<PosShiftSummary>> {
  const ctx = await requirePermission('restaurant.manage');
  if (!ctx.companyId) return { ok: false, error: 'err_no_company' };
  const sb = await createClient();

  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const sinceIso = since.toISOString();

  const { data, error } = await sb.from('erp_pos_invoices')
    .select('order_type, payment_method, status, grand_total, payload')
    .eq('company_id', ctx.companyId)
    .eq('created_by', ctx.userId)
    .eq('status', 'issued')
    .gte('issue_at', sinceIso)
    .limit(2000);
  if (error) return { ok: false, error: error.message };

  const rows = data ?? [];
  let revenue = 0;
  let itemsSold = 0;
  const methodMap = new Map<string, { orders: number; revenue: number }>();
  const modeMap = new Map<string, { orders: number; revenue: number }>();

  for (const r of rows) {
    const total = Number(r.grand_total ?? 0);
    revenue += total;
    const lines = ((r.payload as { lines?: { qty?: number }[] } | null)?.lines) ?? [];
    for (const l of lines) itemsSold += Number(l.qty ?? 0);

    const method = (r.payment_method as string | null) ?? 'cash';
    const m = methodMap.get(method) ?? { orders: 0, revenue: 0 };
    m.orders += 1; m.revenue += total; methodMap.set(method, m);

    const mode = (r.order_type as string | null) ?? 'takeaway';
    const md = modeMap.get(mode) ?? { orders: 0, revenue: 0 };
    md.orders += 1; md.revenue += total; modeMap.set(mode, md);
  }

  const orders = rows.length;
  return {
    ok: true,
    data: {
      cashierName: ctx.profile.full_name || ctx.profile.email || '',
      sinceIso,
      orders,
      revenue,
      itemsSold,
      avgTicket: orders > 0 ? revenue / orders : 0,
      byMethod: [...methodMap.entries()].map(([method, v]) => ({ method, ...v })).sort((a, b) => b.revenue - a.revenue),
      byMode: [...modeMap.entries()].map(([mode, v]) => ({ mode, ...v })).sort((a, b) => b.revenue - a.revenue),
    },
  };
}
