'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, type ActionResult } from '@/lib/erp/guards';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { logAudit } from '@/lib/erp/audit';

/**
 * Platform Contact Model — reusable lightweight customer quick-create, usable by
 * ANY pack (pharmacy walk-in, clinic patient, retail/cash POS, quick reg). It
 * writes to the shared erp_customers table with contact_mode='lightweight' and
 * NO FMCG governance fields (no CR/VAT/GPS/National Address/trade) and NO
 * approval workflow. Gated by two tenant feature flags
 * (platform.lightweight_customer_mode + platform.quick_customer_create) and a
 * role permission. The FULL business-customer flow stays the FMCG governance path.
 */
export async function quickCreateCustomer(input: {
  name: string; phone?: string | null; notes?: string | null;
}): Promise<ActionResult<{ id: string; name: string }>> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: error ?? 'unauthorized' };

  // Permission (by role): sellers + customer managers may quick-create.
  const perms = ctx.permissions as string[];
  const allowed = perms.includes('customers.manage') || perms.includes('sales.sell')
    || perms.includes('sales.collect') || ctx.isSuperAdmin;
  if (!allowed) return { ok: false, error: 'no_permission' };

  const supabase = await createClient();
  // Tenant feature gates.
  const flags = await getFeatureFlags(supabase, ctx.companyId);
  if (!flags['platform.quick_customer_create']) return { ok: false, error: 'quick_create_disabled' };
  if (!flags['platform.lightweight_customer_mode']) return { ok: false, error: 'lightweight_disabled' };

  const nm = (input.name ?? '').trim();
  if (!nm) return { ok: false, error: 'name_required' };

  const code = 'WC' + Date.now().toString(36).toUpperCase();
  const { data, error: insErr } = await supabase
    .from('erp_customers')
    .insert({
      company_id: ctx.companyId, code, name: nm,
      phone: input.phone?.trim() || null, notes: input.notes?.trim() || null,
      contact_mode: 'lightweight', is_active: true, is_approved: true, balance: 0,
    })
    .select('id, name')
    .single();
  if (insErr) return { ok: false, error: insErr.message };

  await logAudit(supabase, {
    action: 'create', entity: 'contact', details: { name: nm, mode: 'lightweight' }, companyId: ctx.companyId,
  });
  revalidatePath('/pharmacy/pos');
  revalidatePath('/sales/pos');
  revalidatePath('/customers');
  return { ok: true, data: { id: (data as { id: string }).id, name: (data as { name: string }).name } };
}
