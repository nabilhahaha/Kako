'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, type ActionResult } from '@/lib/erp/guards';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { logAudit } from '@/lib/erp/audit';
import { createTransfer, completeTransfer } from '../../inventory/transfers/actions';

/**
 * Multi-branch stock visibility + transfers (pharmacy). Visibility comes from
 * erp_pharmacy_branch_stock; transfers reuse the proven erp_transfer_orders /
 * erp_complete_transfer pipeline and then move the batches (FEFO) from the source
 * to the destination warehouse so expiry tracking survives the move. Feature- and
 * permission-gated; tenant-scoped; audited.
 */

export interface BranchStockRow {
  product_id: string; code: string; name: string; name_ar: string | null;
  branch_id: string; branch_name: string; branch_name_ar: string | null; on_hand: number;
}

async function gate(): Promise<ActionResult<{ companyId: string; userId: string; perms: string[]; isSuper: boolean }>> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx || !ctx.companyId) return { ok: false, error: error ?? 'unauthorized' };
  const supabase = await createClient();
  const flags = await getFeatureFlags(supabase, ctx.companyId);
  if (flags['pharmacy.multi_branch'] !== true) return { ok: false, error: 'feature_disabled' };
  return { ok: true, data: { companyId: ctx.companyId, userId: ctx.userId, perms: ctx.permissions as string[], isSuper: ctx.isSuperAdmin } };
}

export async function branchStock(query: string): Promise<BranchStockRow[]> {
  const g = await gate();
  if (!g.ok) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc('erp_pharmacy_branch_stock', { p_query: (query ?? '').trim(), p_limit: 80 });
  return (data as BranchStockRow[]) ?? [];
}

export interface PharmacyTransferLine { product_id: string; quantity: number }

/** One-step branch-to-branch transfer (create + complete) with batch FEFO move. */
export async function transferStock(input: {
  from_warehouse_id: string;
  to_warehouse_id: string;
  branch_id: string;
  notes?: string;
  lines: PharmacyTransferLine[];
}): Promise<ActionResult> {
  const g = await gate();
  if (!g.ok || !g.data) return { ok: false, error: g.error };
  const { companyId, perms, isSuper } = g.data;
  if (!(perms.includes('inventory.transfer') || isSuper)) return { ok: false, error: 'no_permission' };
  const lines = (input.lines ?? []).filter((l) => l.product_id && l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: 'empty' };
  if (input.from_warehouse_id === input.to_warehouse_id) return { ok: false, error: 'same_warehouse' };

  const created = await createTransfer({
    branch_id: input.branch_id, from_warehouse_id: input.from_warehouse_id,
    to_warehouse_id: input.to_warehouse_id, notes: input.notes, lines,
  });
  if (!created.ok || !created.data) return { ok: false, error: created.error };
  const done = await completeTransfer(created.data.id);
  if (!done.ok) return { ok: false, error: done.error };

  // Batch-aware move: pull FEFO batches from the source warehouse and mirror them
  // into the destination so expiry/FEFO stay correct (best-effort; the stock
  // movements already balanced inventory_stock).
  const supabase = await createClient();
  const flags = await getFeatureFlags(supabase, companyId);
  if (flags['pharmacy.batch_tracking'] === true) {
    for (const l of lines) {
      const { data: picks } = await supabase.rpc('erp_pick_fefo_batches', {
        p_product: l.product_id, p_warehouse: input.from_warehouse_id, p_qty: l.quantity,
      });
      for (const p of (picks ?? []) as Array<{ batch_id: string; take: number }>) {
        const { data: b } = await supabase.from('erp_product_batches')
          .select('qty_on_hand, batch_number, expiry_date, cost_price, supplier_id').eq('id', p.batch_id).maybeSingle();
        const row = b as { qty_on_hand: number; batch_number: string | null; expiry_date: string | null; cost_price: number | null; supplier_id: string | null } | null;
        if (!row) continue;
        const take = Number(p.take);
        await supabase.from('erp_product_batches').update({ qty_on_hand: Math.max(0, Number(row.qty_on_hand) - take), updated_at: new Date().toISOString() }).eq('id', p.batch_id);
        // merge into a matching dest batch, else create one
        const { data: dest } = await supabase.from('erp_product_batches')
          .select('id, qty_on_hand').eq('company_id', companyId).eq('product_id', l.product_id)
          .eq('warehouse_id', input.to_warehouse_id).eq('batch_number', row.batch_number ?? '').maybeSingle();
        const d = dest as { id: string; qty_on_hand: number } | null;
        if (d) {
          await supabase.from('erp_product_batches').update({ qty_on_hand: Number(d.qty_on_hand) + take, updated_at: new Date().toISOString() }).eq('id', d.id);
        } else {
          await supabase.from('erp_product_batches').insert({
            company_id: companyId, product_id: l.product_id, warehouse_id: input.to_warehouse_id,
            batch_number: row.batch_number, expiry_date: row.expiry_date, qty_on_hand: take,
            cost_price: row.cost_price, supplier_id: row.supplier_id,
          });
        }
      }
    }
  }

  await logAudit(supabase, {
    action: 'create', entity: 'pharmacy_transfer', entityId: created.data.id,
    details: { from: input.from_warehouse_id, to: input.to_warehouse_id, lines: lines.length }, companyId,
  });
  revalidatePath('/pharmacy/branches');
  revalidatePath('/inventory');
  return { ok: true };
}
