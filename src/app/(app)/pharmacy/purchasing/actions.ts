'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { logAudit } from '@/lib/erp/audit';
import { computeLine, computeTotals } from '@/lib/erp/sales-calc';

/**
 * Pharmacy Purchasing & Reorder — server actions.
 *
 * The reorder list comes from erp_pharmacy_reorder_suggestions (low-stock →
 * suggested qty + last cost + preferred supplier). One-click PO creation groups
 * the selected items by supplier and reuses the platform's proven purchase-order
 * tables + sequence; receiving reuses the atomic erp_receive_purchase_order RPC
 * (goods receipt + stock + AP journal + supplier balance) and, when Batch
 * Tracking is on, writes batch rows so FEFO/expiry keep working. Permission- and
 * feature-gated; tenant-scoped via RLS; audited.
 */

const PURCHASE_PERMS = ['inventory.adjust', 'purchasing.manage', 'pricing.manage'];

export interface ReorderSuggestion {
  product_id: string;
  code: string;
  name: string;
  name_ar: string | null;
  on_hand: number;
  min_stock: number;
  suggested_qty: number;
  last_cost: number | null;
  supplier_id: string | null;
  supplier_name: string | null;
}

type Gate =
  | { ok: true; companyId: string; userId: string; perms: string[]; isSuper: boolean }
  | { ok: false; error: string };

async function ensureEnabled(): Promise<Gate> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: error ?? 'unauthorized' };
  const perms = ctx.permissions as string[];
  if (!ctx.companyId) return { ok: false, error: 'no_company' };
  if (!(PURCHASE_PERMS.some((p) => perms.includes(p)) || ctx.isSuperAdmin)) {
    return { ok: false, error: 'no_permission' };
  }
  const supabase = await createClient();
  const flags = await getFeatureFlags(supabase, ctx.companyId);
  if (flags['pharmacy.purchase_orders'] !== true) return { ok: false, error: 'feature_disabled' };
  return { ok: true, companyId: ctx.companyId, userId: ctx.userId, perms, isSuper: ctx.isSuperAdmin };
}

export async function reorderSuggestions(): Promise<ReorderSuggestion[]> {
  const gate = await ensureEnabled();
  if (!gate.ok) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc('erp_pharmacy_reorder_suggestions');
  return (data as ReorderSuggestion[]) ?? [];
}

export interface ReorderItem {
  product_id: string;
  quantity: number;
  unit_price: number;
  supplier_id: string;
}

/** Group selected reorder items by supplier and raise one PO per supplier
 *  (status 'sent'). Reuses erp_next_number + erp_purchase_orders/_lines. */
export async function createReorderPurchaseOrders(
  items: ReorderItem[],
): Promise<ActionResult<{ created: number }>> {
  const gate = await ensureEnabled();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { companyId, userId } = gate;

  const valid = (items ?? []).filter((i) => i.product_id && i.supplier_id && i.quantity > 0);
  if (valid.length === 0) return { ok: false, error: 'none_selected' };

  const supabase = await createClient();

  // Receiving branch — prefer the company HQ branch, else the first active one.
  const { data: branch } = await supabase
    .from('erp_branches')
    .select('id')
    .eq('company_id', companyId).eq('is_active', true)
    .order('is_hq', { ascending: false }).limit(1).maybeSingle();
  const branchId = (branch as { id: string } | null)?.id ?? null;
  if (!branchId) return { ok: false, error: 'no_branch' };

  // Group by supplier.
  const bySupplier = new Map<string, ReorderItem[]>();
  for (const i of valid) {
    const arr = bySupplier.get(i.supplier_id) ?? [];
    arr.push(i);
    bySupplier.set(i.supplier_id, arr);
  }

  let created = 0;
  for (const [supplierId, lines] of bySupplier) {
    const lineInputs = lines.map((l) => ({
      product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price,
      discount_pct: 0, tax_rate: 0,
    }));
    const totals = computeTotals(lineInputs);

    const { data: poNumber, error: numErr } = await supabase.rpc('erp_next_number', {
      p_branch_id: branchId, p_seq_type: 'purchase_order',
    });
    if (numErr) return { ok: false, error: friendlyDbError(numErr) };

    const { data: po, error: poErr } = await supabase
      .from('erp_purchase_orders')
      .insert({
        branch_id: branchId, supplier_id: supplierId, po_number: poNumber as string,
        status: 'sent', total_amount: totals.total_amount, tax_amount: totals.tax_amount,
        net_amount: totals.net_amount, notes: 'Reorder (auto)', created_by: userId,
      })
      .select('id').single();
    if (poErr) return { ok: false, error: friendlyDbError(poErr) };

    const lineRows = lineInputs.map((l) => ({
      purchase_order_id: po.id, product_id: l.product_id,
      quantity: l.quantity, unit_price: l.unit_price, line_total: computeLine(l).net,
    }));
    const { error: linesErr } = await supabase.from('erp_purchase_order_lines').insert(lineRows);
    if (linesErr) {
      await supabase.from('erp_purchase_orders').delete().eq('id', po.id);
      return { ok: false, error: friendlyDbError(linesErr) };
    }

    await logAudit(supabase, {
      action: 'create', entity: 'purchase_order', entityId: po.id,
      details: { po_number: poNumber, supplier_id: supplierId, lines: lineRows.length, source: 'reorder' },
      companyId,
    });
    created += 1;
  }

  revalidatePath('/pharmacy/purchasing');
  return { ok: true, data: { created } };
}

export interface PharmacyPO {
  id: string;
  po_number: string;
  status: string;
  net_amount: number;
  created_at: string;
  supplier_name: string | null;
  line_count: number;
}

export async function listPharmacyPurchaseOrders(): Promise<PharmacyPO[]> {
  const gate = await ensureEnabled();
  if (!gate.ok) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_purchase_orders')
    .select('id, po_number, status, net_amount, created_at, supplier:erp_suppliers(name, name_ar), lines:erp_purchase_order_lines(count)')
    .order('created_at', { ascending: false }).limit(50);
  type Row = {
    id: string; po_number: string; status: string; net_amount: number; created_at: string;
    supplier: { name: string; name_ar: string | null } | null;
    lines: Array<{ count: number }>;
  };
  return ((data as Row[] | null) ?? []).map((r) => ({
    id: r.id, po_number: r.po_number, status: r.status, net_amount: Number(r.net_amount),
    created_at: r.created_at, supplier_name: r.supplier?.name ?? null,
    line_count: r.lines?.[0]?.count ?? 0,
  }));
}

/** Receive a PO in full into the company warehouse. Reuses the atomic
 *  erp_receive_purchase_order RPC; with Batch Tracking on, writes batch rows
 *  (qty/cost/supplier) so FEFO + expiry continue to work. */
export async function receivePharmacyPurchaseOrder(poId: string): Promise<ActionResult> {
  const gate = await ensureEnabled();
  if (!gate.ok) return { ok: false, error: gate.error };
  const { companyId, userId } = gate;
  if (!poId) return { ok: false, error: 'invalid' };

  const supabase = await createClient();

  // Resolve a receiving warehouse in the tenant (prefer HQ branch's warehouse).
  const { data: wh } = await supabase
    .from('erp_warehouses')
    .select('id, branch:erp_branches!inner(company_id, is_hq)')
    .eq('branch.company_id', companyId).eq('is_active', true)
    .order('branch(is_hq)', { ascending: false }).limit(1).maybeSingle();
  const warehouseId = (wh as { id: string } | null)?.id ?? null;
  if (!warehouseId) return { ok: false, error: 'no_warehouse' };

  // Pre-read PO + lines (for the supplier + per-line qty/cost used to build batches).
  const { data: po } = await supabase
    .from('erp_purchase_orders').select('id, supplier_id, po_number').eq('id', poId).maybeSingle();
  if (!po) return { ok: false, error: 'not_found' };
  const { data: lines } = await supabase
    .from('erp_purchase_order_lines').select('product_id, quantity, unit_price').eq('purchase_order_id', poId);

  const { error: rpcErr } = await supabase.rpc('erp_receive_purchase_order', {
    p_po_id: poId, p_warehouse_id: warehouseId, p_details: [],
  });
  if (rpcErr) return { ok: false, error: friendlyDbError(rpcErr) };

  // Batch rows for FEFO/expiry (the RPC adds stock + journal; batches are tracked
  // separately, mirroring the manual Batch Intake). Best-effort, sale-safe.
  const flags = await getFeatureFlags(supabase, companyId);
  if (flags['pharmacy.batch_tracking'] === true && lines?.length) {
    const supplierId = (po as { supplier_id: string }).supplier_id;
    const batchRows = (lines as Array<{ product_id: string; quantity: number; unit_price: number }>).map((l) => ({
      company_id: companyId, product_id: l.product_id, warehouse_id: warehouseId,
      batch_number: null as string | null, expiry_date: null as string | null,
      qty_on_hand: Number(l.quantity), cost_price: Number(l.unit_price),
      supplier_id: supplierId, created_by: userId,
    }));
    await supabase.from('erp_product_batches').insert(batchRows);
  }

  await logAudit(supabase, {
    action: 'update', entity: 'purchase_order', entityId: poId,
    details: { po_number: (po as { po_number: string }).po_number, received: true }, companyId,
  });

  revalidatePath('/pharmacy/purchasing');
  revalidatePath('/pharmacy/pos');
  revalidatePath('/inventory');
  return { ok: true };
}
