'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, type ActionResult } from '@/lib/erp/guards';
import { getSetupProfile, resolveModuleChanges } from '@/lib/erp/setup-wizard';
import type { Module } from '@/lib/erp/navigation';

function isCompanyAdmin(ctx: { memberships: { role: string }[] }) {
  return ctx.memberships.some((m) => m.role === 'admin');
}

/** Apply the setup-wizard answers to the company's enabled modules. Company
 *  admin (owner) only. Idempotent: re-running with the same answers is a no-op.
 *  Disabling never removes a coarse plan module a tenant relies on — it only
 *  toggles the optional ones listed in the profile. */
export async function applySetupProfile(answers: Record<string, string>): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: error ?? 'unauthorized' };
  if (!ctx.companyId || !isCompanyAdmin(ctx)) return { ok: false, error: 'unauthorized' };

  const profile = getSetupProfile(ctx.company?.business_type ?? null);
  if (!profile) {
    await markDone(ctx.companyId);
    return { ok: true };
  }

  const { enable, disable } = resolveModuleChanges(profile, answers);
  const supabase = await createClient();

  // Enable: upsert enabled=true. Disable: set enabled=false (keep the row so the
  // owner can re-enable later from settings).
  const rows = [
    ...enable.map((m) => ({ company_id: ctx.companyId, module: m as Module, enabled: true })),
    ...disable.map((m) => ({ company_id: ctx.companyId, module: m as Module, enabled: false })),
  ];
  if (rows.length > 0) {
    const { error: upErr } = await supabase
      .from('erp_company_modules')
      .upsert(rows, { onConflict: 'company_id,module' });
    if (upErr) return { ok: false, error: upErr.message };
  }

  await markDone(ctx.companyId);
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Let the owner skip the wizard without changing modules. */
export async function skipSetup(): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: error ?? 'unauthorized' };
  if (!ctx.companyId || !isCompanyAdmin(ctx)) return { ok: false, error: 'unauthorized' };
  await markDone(ctx.companyId);
  revalidatePath('/', 'layout');
  return { ok: true };
}

async function markDone(companyId: string) {
  const supabase = await createClient();
  await supabase.from('erp_companies').update({ setup_done: true }).eq('id', companyId);
}
