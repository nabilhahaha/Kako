'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { logAudit } from '@/lib/erp/audit';
import { getT } from '@/lib/i18n/server';

/**
 * Manually adjust stock for a product in a warehouse. The signed delta is
 * recorded as an 'adjustment' stock movement, which the inventory trigger
 * applies to the on-hand quantity.
 */
export async function adjustStock(input: {
  warehouse_id: string;
  product_id: string;
  delta: number;
  notes?: string;
}): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'unauthorized' };

  const { t } = await getT();
  if (!input.warehouse_id) return { ok: false, error: t('inventory.errorWarehouseRequired') };
  if (!input.product_id) return { ok: false, error: t('inventory.errorProductRequired') };
  if (!input.delta || input.delta === 0)
    return { ok: false, error: t('inventory.errorDeltaRequired') };

  const supabase = await createClient();
  const note = input.notes?.trim() || t('inventory.defaultAdjustmentNote');
  const { error } = await supabase.from('erp_stock_movements').insert({
    movement_type: 'adjustment',
    warehouse_id: input.warehouse_id,
    product_id: input.product_id,
    quantity: input.delta,
    reference_type: 'manual',
    notes: note,
    created_by: ctx.userId,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };

  // Critical-action audit: stock.adjust (irreversible — corrected by a counter-entry).
  await logAudit(supabase, {
    action: 'update', entity: 'stock_adjustment',
    details: { warehouse_id: input.warehouse_id, product_id: input.product_id, delta: input.delta, reason: note },
    companyId: ctx.companyId,
  });
  revalidatePath('/inventory');
  return { ok: true };
}
