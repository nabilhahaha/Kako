'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requirePermission, requireModuleAction, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { getT } from '@/lib/i18n/server';

// Pharmacy dispensing register: a regulatory log (patient / doctor / Rx /
// controlled) with FEFO batch capture per line. Does not move stock or post
// accounting — the sale runs through POS.

function revalidate(id?: string) {
  revalidatePath('/pharmacy/dispense');
  if (id) revalidatePath(`/pharmacy/dispense/${id}`);
}

export async function createDispense(): Promise<ActionResult<string>> {
  const ctx = await requirePermission('pharmacy.dispense');
  const modErr = requireModuleAction(ctx, 'pharmacy');
  if (modErr) return modErr;
  const { t } = await getT();
  if (!ctx.companyId) return { ok: false, error: t('pharmacy.errNoCompany') };
  const supabase = await createClient();
  const { data, error } = await supabase.from('erp_pharmacy_dispenses')
    .insert({ company_id: ctx.companyId, status: 'open', created_by: ctx.userId })
    .select('id').single();
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate();
  return { ok: true, data: (data as { id: string }).id };
}

export async function updateDispenseMeta(formData: FormData): Promise<ActionResult> {
  const ctx = await requirePermission('pharmacy.dispense');
  const modErr = requireModuleAction(ctx, 'pharmacy');
  if (modErr) return modErr;
  const { t } = await getT();
  if (!ctx.companyId) return { ok: false, error: t('pharmacy.errNoCompany') };
  const id = String(formData.get('id') || '').trim();
  if (!id) return { ok: false, error: t('pharmacy.errRecordRequired') };
  const supabase = await createClient();
  const { error } = await supabase.from('erp_pharmacy_dispenses').update({
    patient_name: String(formData.get('patient_name') || '').trim() || null,
    patient_phone: String(formData.get('patient_phone') || '').trim() || null,
    doctor_name: String(formData.get('doctor_name') || '').trim() || null,
    rx_number: String(formData.get('rx_number') || '').trim() || null,
    invoice_no: String(formData.get('invoice_no') || '').trim() || null,
    is_controlled: String(formData.get('is_controlled') || '') === 'on' || String(formData.get('is_controlled') || '') === 'true',
    notes: String(formData.get('notes') || '').trim() || null,
  }).eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate(id);
  return { ok: true };
}

export async function addDispenseItem(dispenseId: string, productId: string): Promise<ActionResult> {
  const ctx = await requirePermission('pharmacy.dispense');
  const modErr = requireModuleAction(ctx, 'pharmacy');
  if (modErr) return modErr;
  const { t } = await getT();
  if (!ctx.companyId) return { ok: false, error: t('pharmacy.errNoCompany') };
  const supabase = await createClient();
  const { data: p } = await supabase.from('erp_products_catalog').select('name, name_ar, sell_price').eq('id', productId).maybeSingle();
  const prod = p as { name: string; name_ar: string | null; sell_price: number } | null;
  if (!prod) return { ok: false, error: t('pharmacy.errProductNotFound') };

  // FEFO: pull the earliest-expiry received batch for traceability.
  const { data: fefo } = await supabase.rpc('erp_product_fefo_batch', { p_product_id: productId });
  const batch = ((fefo as { batch_number: string | null; expiry_date: string | null }[]) ?? [])[0] ?? null;

  const { error } = await supabase.from('erp_pharmacy_dispense_items').insert({
    company_id: ctx.companyId, dispense_id: dispenseId, product_id: productId,
    name: prod.name_ar || prod.name, qty: 1, price: Number(prod.sell_price || 0),
    batch_number: batch?.batch_number ?? null, expiry_date: batch?.expiry_date ?? null,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate(dispenseId);
  return { ok: true };
}

export async function setItemQty(itemId: string, qty: number, dispenseId: string): Promise<ActionResult> {
  const ctx = await requirePermission('pharmacy.dispense');
  const modErr = requireModuleAction(ctx, 'pharmacy');
  if (modErr) return modErr;
  const { t } = await getT();
  if (!ctx.companyId) return { ok: false, error: t('pharmacy.errNoCompany') };
  const supabase = await createClient();
  if (qty <= 0) {
    const { error } = await supabase.from('erp_pharmacy_dispense_items').delete().eq('id', itemId);
    if (error) return { ok: false, error: friendlyDbError(error) };
  } else {
    const { error } = await supabase.from('erp_pharmacy_dispense_items').update({ qty: Math.round(qty) }).eq('id', itemId);
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  revalidate(dispenseId);
  return { ok: true };
}

export async function finalizeDispense(id: string): Promise<ActionResult> {
  const ctx = await requirePermission('pharmacy.dispense');
  const modErr = requireModuleAction(ctx, 'pharmacy');
  if (modErr) return modErr;
  const { t } = await getT();
  if (!ctx.companyId) return { ok: false, error: t('pharmacy.errNoCompany') };
  const supabase = await createClient();
  const { error } = await supabase.from('erp_pharmacy_dispenses').update({ status: 'done', dispensed_at: new Date().toISOString() }).eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate(id);
  return { ok: true };
}

export async function cancelDispense(id: string): Promise<ActionResult> {
  const ctx = await requirePermission('pharmacy.dispense');
  const modErr = requireModuleAction(ctx, 'pharmacy');
  if (modErr) return modErr;
  const { t } = await getT();
  if (!ctx.companyId) return { ok: false, error: t('pharmacy.errNoCompany') };
  const supabase = await createClient();
  const { error } = await supabase.from('erp_pharmacy_dispenses').update({ status: 'cancelled' }).eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate(id);
  return { ok: true };
}
