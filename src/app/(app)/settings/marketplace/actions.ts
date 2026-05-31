'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, type ActionResult } from '@/lib/erp/guards';
import type { Module } from '@/lib/erp/navigation';

/** Toggle a single module on/off for the current company. Company-admin only.
 *  Reuses the guarded SECURITY DEFINER RPC (erp_apply_setup_modules) so the
 *  App Marketplace and the setup wizard share the exact same safe write path. */
export async function toggleCompanyModule(module: Module, enabled: boolean): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: error ?? 'unauthorized' };
  if (!ctx.companyId || !ctx.memberships.some((m) => m.role === 'admin')) {
    return { ok: false, error: 'unauthorized' };
  }
  const supabase = await createClient();
  const { error: rpcErr } = await supabase.rpc('erp_apply_setup_modules', {
    p_enable: enabled ? [module] : [],
    p_disable: enabled ? [] : [module],
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };
  revalidatePath('/', 'layout');
  return { ok: true };
}
