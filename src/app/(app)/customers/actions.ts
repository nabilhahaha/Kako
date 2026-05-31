'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { getActiveCustomFields } from '@/lib/erp/custom-fields-server';
import { validateCustomValues } from '@/lib/erp/form-schema';
import { coerceCustomValue } from '@/lib/erp/custom-fields';
import { getT } from '@/lib/i18n/server';

/** Parse the `custom` JSON bag from a form, validate it against the entity's
 *  active custom-field definitions (server-authoritative), and return the
 *  coerced bag to store in the row's `custom` jsonb. */
async function resolveCustom(
  entity: string,
  raw: FormDataEntryValue | null,
): Promise<{ ok: true; custom: Record<string, unknown> } | { ok: false; error: string }> {
  const defs = await getActiveCustomFields(entity);
  if (defs.length === 0) return { ok: true, custom: {} };
  let values: Record<string, unknown> = {};
  if (raw) { try { values = JSON.parse(String(raw)); } catch { values = {}; } }
  const { ok, errors } = validateCustomValues(defs, values);
  if (!ok) return { ok: false, error: Object.values(errors)[0] };
  const custom: Record<string, unknown> = {};
  for (const d of defs) {
    const v = coerceCustomValue(d, values[d.key]);
    if (v !== undefined) custom[d.key] = v;
  }
  return { ok: true, custom };
}

function num(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

export async function upsertCustomer(formData: FormData): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const { t } = await getT();

  const id = String(formData.get('id') || '').trim();
  const code = String(formData.get('code') || '').trim();
  const name = String(formData.get('name') || '').trim();
  if (!code) return { ok: false, error: t('customers.errCodeRequired') };
  if (!name) return { ok: false, error: t('customers.errNameRequired') };

  const branchId = String(formData.get('branch_id') || '').trim();
  const salesmanId = String(formData.get('salesman_id') || '').trim();
  const visitDay = String(formData.get('visit_day') || '').trim();

  // Custom fields (Dynamic Forms): validated + coerced server-side.
  const cf = await resolveCustom('customer', formData.get('custom'));
  if (!cf.ok) return { ok: false, error: cf.error };

  const payload = {
    code,
    name,
    name_ar: String(formData.get('name_ar') || '').trim() || null,
    phone: String(formData.get('phone') || '').trim() || null,
    email: String(formData.get('email') || '').trim() || null,
    address: String(formData.get('address') || '').trim() || null,
    city: String(formData.get('city') || '').trim() || null,
    tax_number: String(formData.get('tax_number') || '').trim() || null,
    credit_limit: num(formData.get('credit_limit')),
    branch_id: branchId || null,
    salesman_id: salesmanId || null,
    visit_day: visitDay || null,
    custom: cf.custom,
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from('erp_customers').update(payload).eq('id', id)
    : await supabase.from('erp_customers').insert(payload);

  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/customers');
  return { ok: true };
}

interface ImportRow {
  code: string;
  name: string;
  name_ar?: string;
  phone?: string;
  city?: string;
  credit_limit?: number;
}

/** Bulk import customers (from a parsed Excel/CSV), upserting on code. */
export async function importCustomers(
  rows: ImportRow[],
  branchId: string | null,
  salesmanId: string | null,
): Promise<ActionResult<{ count: number }>> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const clean = rows
    .map((r) => ({
      code: String(r.code ?? '').trim(),
      name: String(r.name ?? '').trim(),
      name_ar: r.name_ar?.toString().trim() || null,
      phone: r.phone?.toString().trim() || null,
      city: r.city?.toString().trim() || null,
      credit_limit: Number(r.credit_limit) || 0,
      branch_id: branchId || null,
      salesman_id: salesmanId || null,
    }))
    .filter((r) => r.code && r.name);

  const { t } = await getT();
  if (clean.length === 0) return { ok: false, error: t('customers.errImportNoRows') };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_customers')
    .upsert(clean, { onConflict: 'company_id,code' });
  if (error) return { ok: false, error: friendlyDbError(error) };

  revalidatePath('/customers');
  return { ok: true, data: { count: clean.length } };
}

/** Assign a salesman and/or visit day to a customer (journey plan). */
export async function setCustomerJourney(
  id: string,
  salesmanId: string | null,
  visitDay: string | null,
): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_customers')
    .update({ salesman_id: salesmanId || null, visit_day: visitDay || null })
    .eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/customers');
  revalidatePath('/sales/journey');
  return { ok: true };
}

/** Submit a customer for onboarding approval: mark it pending and start the
 *  generic workflow (an approval task routes to the company admin). */
export async function requestCustomerApproval(id: string): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const { t } = await getT();
  if (!id) return { ok: false, error: t('customers.errUnauthorized') };

  const supabase = await createClient();
  await supabase.from('erp_customers').update({ is_approved: false }).eq('id', id);
  const { error } = await supabase.rpc('erp_workflow_start', {
    p_key: 'customer_onboarding', p_entity: 'customer', p_record_id: id, p_context: {},
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/customers');
  revalidatePath('/approvals');
  return { ok: true };
}

/** Super admin approves a rep-created customer so it can be sold to. */
export async function approveCustomer(id: string): Promise<ActionResult> {
  const { ctx } = await requireAuth();
  const { t } = await getT();
  if (!ctx) return { ok: false, error: t('customers.errUnauthorized') };
  if (!ctx.isSuperAdmin) return { ok: false, error: t('customers.errApproveAdminOnly') };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_customers')
    .update({ is_approved: true })
    .eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/customers');
  return { ok: true };
}

export async function toggleCustomerActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_customers')
    .update({ is_active: isActive })
    .eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/customers');
  return { ok: true };
}
