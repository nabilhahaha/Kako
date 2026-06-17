'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { logAudit } from '@/lib/erp/audit';

/**
 * Pharmacy inventory valuation — server actions.
 *
 * The valuation method (FIFO / Moving Average) is the tenant's OFFICIAL accounting
 * basis, stored in erp_inventory_settings and used consistently by valuation,
 * COGS, gross profit, reports and dashboards (via erp_company_valuation_method /
 * erp_product_cost). The screen may render the other method for comparison, but
 * the stored setting is the source of truth. Feature- and permission-gated.
 */

export type ValuationMethod = 'fifo' | 'moving_avg';

export interface ValuationRow {
  product_id: string;
  code: string;
  name: string;
  name_ar: string | null;
  on_hand: number;
  unit_cost: number;
  total_value: number;
}

async function gate(): Promise<ActionResult<{ companyId: string; userId: string; perms: string[]; isSuper: boolean }>> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx || !ctx.companyId) return { ok: false, error: error ?? 'unauthorized' };
  const supabase = await createClient();
  const flags = await getFeatureFlags(supabase, ctx.companyId);
  if (flags['pharmacy.inventory_valuation'] !== true) return { ok: false, error: 'feature_disabled' };
  return { ok: true, data: { companyId: ctx.companyId, userId: ctx.userId, perms: ctx.permissions as string[], isSuper: ctx.isSuperAdmin } };
}

/** The tenant's official valuation method (default fifo). */
export async function getOfficialMethod(): Promise<ValuationMethod> {
  const { ctx } = await requireAuth();
  if (!ctx?.companyId) return 'fifo';
  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_inventory_settings').select('valuation_method').eq('company_id', ctx.companyId).maybeSingle();
  return ((data as { valuation_method: ValuationMethod } | null)?.valuation_method) ?? 'fifo';
}

/** Valuation rows for a method. `method` 'official' resolves to the tenant setting;
 *  'fifo'/'moving_avg' are explicit (for side-by-side comparison). */
export async function inventoryValuation(method: ValuationMethod | 'official' = 'official'): Promise<ValuationRow[]> {
  const g = await gate();
  if (!g.ok) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc('erp_pharmacy_inventory_valuation', { p_method: method });
  return (data as ValuationRow[]) ?? [];
}

/** Set the tenant's official valuation method. Admin / settings.users only; audited. */
export async function setOfficialMethod(method: ValuationMethod): Promise<ActionResult> {
  const g = await gate();
  if (!g.ok || !g.data) return { ok: false, error: g.error };
  const { companyId, userId, perms, isSuper } = g.data;
  if (!(perms.includes('settings.users') || isSuper)) return { ok: false, error: 'no_permission' };
  if (method !== 'fifo' && method !== 'moving_avg') return { ok: false, error: 'invalid_method' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_inventory_settings')
    .upsert({ company_id: companyId, valuation_method: method, updated_at: new Date().toISOString(), updated_by: userId },
      { onConflict: 'company_id' });
  if (error) return { ok: false, error: friendlyDbError(error) };

  await logAudit(supabase, {
    action: 'update', entity: 'inventory_settings', entityId: companyId,
    details: { valuation_method: method }, companyId,
  });
  revalidatePath('/pharmacy/valuation');
  revalidatePath('/pharmacy/dashboard');
  revalidatePath('/pharmacy/reports');
  return { ok: true };
}
