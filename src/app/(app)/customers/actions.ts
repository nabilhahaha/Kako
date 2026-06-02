'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { getActiveCustomFields } from '@/lib/erp/custom-fields-server';
import { validateCustomValues } from '@/lib/erp/form-schema';
import { coerceCustomValue } from '@/lib/erp/custom-fields';
import { getT } from '@/lib/i18n/server';
import { isCompanyWide } from '@/lib/erp/scope';

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

/** A finite number from a form field, or null when blank/invalid (for optional
 *  numeric columns like GPS / payment terms). */
function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? '').replace(/,/g, '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Trimmed string or null. */
function strOrNull(v: FormDataEntryValue | null): string | null {
  return String(v ?? '').trim() || null;
}

export async function upsertCustomer(formData: FormData): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'unauthorized' };
  const { t } = await getT();

  const id = String(formData.get('id') || '').trim();
  const code = String(formData.get('code') || '').trim();
  const name = String(formData.get('name') || '').trim();
  if (!code) return { ok: false, error: t('customers.errCodeRequired') };
  if (!name) return { ok: false, error: t('customers.errNameRequired') };
  if (num(formData.get('credit_limit')) < 0) return { ok: false, error: t('customers.errCreditNegative') };

  const branchId = String(formData.get('branch_id') || '').trim();
  let salesmanId = String(formData.get('salesman_id') || '').trim();
  const visitDay = String(formData.get('visit_day') || '').trim();

  // D1: a scoped Sales Rep creating a customer self-assigns, so it lands in their
  // visibility (S4) and passes the S4b write-scope instead of erroring/vanishing.
  const roles = ctx.memberships.map((m) => m.role);
  if (!id && !salesmanId && !isCompanyWide(roles) && roles.includes('salesman')) {
    salesmanId = ctx.userId;
  }

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
    // FMCG hierarchy S3 — expanded customer model. FK ids (segment/class/channel
    // → company master data; region/area → S1 entities) are passed through;
    // tenant RLS + FK constraints keep them valid (invalid → insert fails).
    segment_id: strOrNull(formData.get('segment_id')),
    classification_id: strOrNull(formData.get('classification_id')),
    channel_id: strOrNull(formData.get('channel_id')),
    region_id: strOrNull(formData.get('region_id')),
    area_id: strOrNull(formData.get('area_id')),
    latitude: numOrNull(formData.get('latitude')),
    longitude: numOrNull(formData.get('longitude')),
    payment_terms_days: numOrNull(formData.get('payment_terms_days')),
    contact_person: strOrNull(formData.get('contact_person')),
    contact_phone: strOrNull(formData.get('contact_phone')),
    cr_number: strOrNull(formData.get('cr_number')),
    national_address: strOrNull(formData.get('national_address')),
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

/** Request a credit-limit change for a customer: records the request and starts
 *  the (threshold-based, multi-step) credit_limit_approval workflow. */
export async function requestCreditLimitChange(customerId: string, requestedLimit: number): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const { t } = await getT();
  if (!customerId) return { ok: false, error: t('customers.errUnauthorized') };
  if (!Number.isFinite(requestedLimit) || requestedLimit < 0) return { ok: false, error: t('customers.errImportNoRows') };

  const supabase = await createClient();
  const { data: cust } = await supabase.from('erp_customers').select('credit_limit').eq('id', customerId).maybeSingle();
  const current = (cust as { credit_limit: number } | null)?.credit_limit ?? null;

  const { data: req, error: insErr } = await supabase
    .from('erp_credit_limit_requests')
    .insert({ customer_id: customerId, current_limit: current, requested_limit: requestedLimit })
    .select('id')
    .single();
  if (insErr) return { ok: false, error: friendlyDbError(insErr) };

  const { error } = await supabase.rpc('erp_workflow_start', {
    p_key: 'credit_limit_approval', p_entity: 'credit_limit_request',
    p_record_id: (req as { id: string }).id, p_context: { amount: requestedLimit },
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
