'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { logAudit } from '@/lib/erp/audit';
import { createReturn, completeReturn } from '../../sales/returns/actions';

/**
 * Batch-aware pharmacy returns. Reuses the proven generic return pipeline
 * (createReturn → erp_complete_sales_return: restock + Sales-Returns/AR journal +
 * customer balance) and then restores each returned line into its SPECIFIC batch
 * (erp_pharmacy_return_restock_batches) so batch quantities, FEFO and expiry stay
 * correct. Feature- and permission-gated; tenant-scoped; audited.
 */

export interface PharmacyReturnLine {
  product_id: string;
  quantity: number;
  unit_price: number;
  batch_number?: string | null;
  expiry_date?: string | null;
}

export async function createPharmacyReturn(input: {
  branch_id: string;
  customer_id: string;
  reason?: string;
  lines: PharmacyReturnLine[];
}): Promise<ActionResult<{ id: string }>> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx || !ctx.companyId) return { ok: false, error: error ?? 'unauthorized' };
  const perms = ctx.permissions as string[];
  if (!(perms.includes('sales.return') || ctx.isSuperAdmin)) return { ok: false, error: 'no_permission' };

  const supabase = await createClient();
  const flags = await getFeatureFlags(supabase, ctx.companyId);
  if (flags['pharmacy.batch_aware_returns'] !== true) return { ok: false, error: 'feature_disabled' };

  const lines = (input.lines ?? []).filter((l) => l.product_id && l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: 'empty' };

  // 1) Create the return (header + lines, carrying the batch per line).
  const created = await createReturn({
    branch_id: input.branch_id, customer_id: input.customer_id,
    reason: input.reason, lines,
  });
  if (!created.ok || !created.data) return { ok: false, error: created.error };

  // 2) Complete it (generic restock + journal + AR), then 3) restore batches.
  const done = await completeReturn(created.data.id);
  if (!done.ok) return { ok: false, error: done.error };

  const { error: rpcErr } = await supabase.rpc('erp_pharmacy_return_restock_batches', { p_return_id: created.data.id });
  if (rpcErr) {
    // The return is committed; surface the batch-restock issue without rolling back.
    await logAudit(supabase, {
      action: 'update', entity: 'pharmacy_return', entityId: created.data.id,
      details: { batch_restock_error: friendlyDbError(rpcErr) }, companyId: ctx.companyId,
    });
  } else {
    await logAudit(supabase, {
      action: 'create', entity: 'pharmacy_return', entityId: created.data.id,
      details: { lines: lines.length, batches: lines.filter((l) => l.batch_number).length }, companyId: ctx.companyId,
    });
  }

  revalidatePath('/pharmacy/returns');
  revalidatePath('/pharmacy/pos');
  revalidatePath('/inventory');
  return { ok: true, data: { id: created.data.id } };
}
