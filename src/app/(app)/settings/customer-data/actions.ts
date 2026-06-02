'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { hasPermission } from '@/lib/erp/permissions';
import type { CustomerLookupKind } from '@/lib/erp/types';

/** Customer master data (FMCG hierarchy S3): company-managed segment /
 *  classification / channel values. Gated by settings.custom_fields (master-data
 *  configuration). Tenant-scoped via RLS (company_id auto-set). The KINDS are
 *  platform-fixed; the VALUES are tenant-managed. */

const KINDS: CustomerLookupKind[] = ['segment', 'classification', 'channel'];

async function guard(): Promise<{ ok: true; companyId: string } | { ok: false; error: string }> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: error ?? 'unauthorized' };
  if (!ctx.companyId || !hasPermission(ctx, 'settings.custom_fields')) return { ok: false, error: 'unauthorized' };
  return { ok: true, companyId: ctx.companyId };
}

/** Stable key within (company, kind). Derived from the name on create; never
 *  changes on edit so existing customer FKs stay valid. */
function slug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

export async function upsertCustomerLookup(formData: FormData): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };

  const id = String(formData.get('id') || '').trim();
  const kind = String(formData.get('kind') || '').trim() as CustomerLookupKind;
  const name = String(formData.get('name') || '').trim();
  const name_ar = String(formData.get('name_ar') || '').trim() || null;
  if (!KINDS.includes(kind)) return { ok: false, error: 'invalid kind' };
  if (!name) return { ok: false, error: 'name required' };

  const supabase = await createClient();
  if (id) {
    // Edit display labels only; kind + code are immutable (preserve FK refs).
    const { error } = await supabase
      .from('erp_customer_lookups')
      .update({ name, name_ar })
      .eq('id', id);
    if (error) return { ok: false, error: friendlyDbError(error) };
  } else {
    const code = slug(String(formData.get('code') || '') || name) || slug(`${kind}_${Date.now()}`);
    const { error } = await supabase
      .from('erp_customer_lookups')
      .insert({ company_id: g.companyId, kind, code, name, name_ar });
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  revalidatePath('/settings/customer-data');
  revalidatePath('/customers');
  return { ok: true };
}

export async function toggleCustomerLookupActive(id: string, isActive: boolean): Promise<ActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };
  const supabase = await createClient();
  const { error } = await supabase.from('erp_customer_lookups').update({ is_active: isActive }).eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/settings/customer-data');
  revalidatePath('/customers');
  return { ok: true };
}
