'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/erp/guards';
import { friendlyDbError, type ActionResult } from '@/lib/erp/guards';

// Clinic: patients + visits (كشف). All actions require clinic.manage and a
// company (the platform owner has none). company_id is set explicitly from the
// caller's context (tenant isolation also enforced by RLS).

const NO_COMPANY = 'هذه العملية تتم من داخل حساب العيادة.';

export async function upsertPatient(formData: FormData): Promise<ActionResult> {
  const ctx = await requirePermission('clinic.manage');
  if (!ctx.companyId) return { ok: false, error: NO_COMPANY };
  const id = String(formData.get('id') || '').trim();
  const name = String(formData.get('name') || '').trim();
  if (!name) return { ok: false, error: 'اسم المريض مطلوب.' };
  const row = {
    code: String(formData.get('code') || '').trim() || null,
    name,
    phone: String(formData.get('phone') || '').trim() || null,
    gender: String(formData.get('gender') || '').trim() || null,
    blood_type: String(formData.get('blood_type') || '').trim() || null,
    notes: String(formData.get('notes') || '').trim() || null,
  };

  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from('erp_patients').update(row).eq('id', id);
    if (error) return { ok: false, error: friendlyDbError(error) };
  } else {
    const { error } = await supabase.from('erp_patients').insert({ ...row, company_id: ctx.companyId });
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  revalidatePath('/clinic/patients');
  return { ok: true };
}

/** Register a visit (كشف) for a patient. */
export async function createVisit(formData: FormData): Promise<ActionResult> {
  const ctx = await requirePermission('clinic.manage');
  if (!ctx.companyId) return { ok: false, error: NO_COMPANY };
  const patient_id = String(formData.get('patient_id') || '').trim();
  if (!patient_id) return { ok: false, error: 'اختر المريض.' };
  const fee = Number(formData.get('fee') || 0);

  const supabase = await createClient();
  const { error } = await supabase.from('erp_clinic_visits').insert({
    company_id: ctx.companyId,
    patient_id,
    doctor_id: ctx.userId,
    visit_type: String(formData.get('visit_type') || 'consultation'),
    complaint: String(formData.get('complaint') || '').trim() || null,
    diagnosis: String(formData.get('diagnosis') || '').trim() || null,
    prescription: String(formData.get('prescription') || '').trim() || null,
    fee: Number.isFinite(fee) && fee >= 0 ? fee : 0,
    status: 'waiting',
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/clinic/visits');
  return { ok: true };
}

export async function setVisitStatus(visitId: string, status: string): Promise<ActionResult> {
  const ctx = await requirePermission('clinic.manage');
  if (!ctx.companyId) return { ok: false, error: NO_COMPANY };
  if (!['waiting', 'in_progress', 'done', 'cancelled'].includes(status))
    return { ok: false, error: 'حالة غير صحيحة.' };
  const supabase = await createClient();
  const { error } = await supabase.from('erp_clinic_visits').update({ status }).eq('id', visitId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/clinic/visits');
  return { ok: true };
}

/** Update a visit's clinical fields (diagnosis / prescription) + mark done. */
export async function updateVisit(formData: FormData): Promise<ActionResult> {
  const ctx = await requirePermission('clinic.manage');
  if (!ctx.companyId) return { ok: false, error: NO_COMPANY };
  const id = String(formData.get('id') || '').trim();
  if (!id) return { ok: false, error: 'الكشف مطلوب.' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_clinic_visits')
    .update({
      complaint: String(formData.get('complaint') || '').trim() || null,
      diagnosis: String(formData.get('diagnosis') || '').trim() || null,
      prescription: String(formData.get('prescription') || '').trim() || null,
      status: 'done',
    })
    .eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/clinic/visits');
  return { ok: true };
}

export async function recordVisitPayment(visitId: string, amount: number): Promise<ActionResult> {
  const ctx = await requirePermission('clinic.manage');
  if (!ctx.companyId) return { ok: false, error: NO_COMPANY };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'مبلغ غير صحيح.' };
  const supabase = await createClient();
  const { data: v } = await supabase.from('erp_clinic_visits').select('paid_amount').eq('id', visitId).maybeSingle();
  const current = (v as { paid_amount?: number } | null)?.paid_amount ?? 0;
  const { error } = await supabase.from('erp_clinic_visits').update({ paid_amount: current + amount }).eq('id', visitId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/clinic/visits');
  return { ok: true };
}
