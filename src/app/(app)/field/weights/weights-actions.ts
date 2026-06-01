'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { friendlyDbError, type ActionResult } from '@/lib/erp/guards';

/** ── Field Execution — weighted-scoring config (FE-5c) ──────────────────────
 *  Company admins set per-component weight + state with no code change. The
 *  RPC + RLS enforce company-admin; the resolver prefers these over pack defaults. */
export interface WeightRow { component: string; weight: number; state: 'required' | 'optional' | 'disabled' }

export async function saveScoreWeights(rows: WeightRow[]): Promise<ActionResult<{ saved: number }>> {
  const ctx = await getUserContext();
  if (!ctx?.company?.id || !ctx.modules.includes('field_ops')) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('erp_fe_save_weights', { p_rows: rows });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/field/weights');
  revalidatePath('/field/dashboard');
  return { ok: true, data: data as { saved: number } };
}
