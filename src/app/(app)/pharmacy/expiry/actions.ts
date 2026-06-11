'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, type ActionResult } from '@/lib/erp/guards';
import { logAudit } from '@/lib/erp/audit';
import { notifyManagers } from '@/lib/erp/notify';

/**
 * Inventory Control — expiry risk + write-off. The expiry buckets come from the
 * erp_expiry_risk view (RLS-scoped). Write-off is the catalog Critical Action
 * `expiry.writeOff` (reason required): it zeroes the batch and posts a negative
 * adjustment movement (trigger updates on-hand), audited + managers notified.
 */

export interface ExpiryRow {
  batch_id: string;
  product_id: string;
  warehouse_id: string | null;
  name: string;
  name_ar: string | null;
  code: string;
  batch_number: string | null;
  expiry_date: string | null;
  qty_on_hand: number;
  days_to_expiry: number | null;
  bucket: string;
}

export async function writeOffBatch(batchId: string, reason?: string): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: error ?? 'unauthorized' };
  if (!(ctx.permissions as string[]).includes('inventory.adjust') && !ctx.isSuperAdmin) {
    return { ok: false, error: 'no_permission' };
  }
  if (!reason?.trim()) return { ok: false, error: 'reason_required' };

  const supabase = await createClient();
  const { data: b } = await supabase
    .from('erp_product_batches')
    .select('id, product_id, warehouse_id, qty_on_hand, batch_number, expiry_date')
    .eq('id', batchId).maybeSingle();
  const batch = b as { id: string; product_id: string; warehouse_id: string | null; qty_on_hand: number; batch_number: string | null; expiry_date: string | null } | null;
  if (!batch) return { ok: false, error: 'batch_not_found' };
  const qty = Number(batch.qty_on_hand || 0);

  // Negative adjustment removes it from on-hand (base units); zero the batch.
  if (qty > 0 && batch.warehouse_id) {
    await supabase.from('erp_stock_movements').insert({
      movement_type: 'adjustment', warehouse_id: batch.warehouse_id, product_id: batch.product_id,
      quantity: -qty, reference_type: 'expiry_writeoff',
      notes: `expiry write-off · batch ${batch.batch_number ?? '-'} · ${reason.trim()}`,
      created_by: ctx.userId,
    });
  }
  await supabase.from('erp_product_batches')
    .update({ qty_on_hand: 0, updated_at: new Date().toISOString() }).eq('id', batchId);

  await logAudit(supabase, {
    action: 'delete', entity: 'expiry_writeoff', entityId: batchId,
    details: { product_id: batch.product_id, batch: batch.batch_number, expiry: batch.expiry_date, qty, reason: reason.trim() },
    companyId: ctx.companyId,
  });
  await notifyManagers(supabase, ctx.companyId, {
    type: 'critical_action',
    titleAr: 'إعدام صنف منتهي', titleEn: 'Expiry write-off',
    body: reason.trim(), link: '/pharmacy/expiry', entity: 'product_batch', recordId: batchId,
  });
  revalidatePath('/pharmacy/expiry');
  revalidatePath('/pharmacy/pos');
  return { ok: true };
}
