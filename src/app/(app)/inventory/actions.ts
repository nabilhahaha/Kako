'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
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
  if (authErr) return { ok: false, error: authErr };

  const { t } = await getT();
  if (!input.warehouse_id) return { ok: false, error: t('inventory.errorWarehouseRequired') };
  if (!input.product_id) return { ok: false, error: t('inventory.errorProductRequired') };
  if (!input.delta || input.delta === 0)
    return { ok: false, error: t('inventory.errorDeltaRequired') };

  const supabase = await createClient();
  const { error } = await supabase.from('erp_stock_movements').insert({
    movement_type: 'adjustment',
    warehouse_id: input.warehouse_id,
    product_id: input.product_id,
    quantity: input.delta,
    reference_type: 'manual',
    notes: input.notes?.trim() || t('inventory.defaultAdjustmentNote'),
    created_by: ctx!.userId,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };

  revalidatePath('/inventory');
  return { ok: true };
}
