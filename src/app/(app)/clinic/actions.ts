'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/erp/guards';
import { friendlyDbError, type ActionResult } from '@/lib/erp/guards';

// Clinic: patients + visits (كشف). All actions require clinic.manage and a
// company (the platform owner has none). company_id is set explicitly from the
// caller's context (tenant isolation also enforced by RLS).

const NO_COMPANY = 'هذه العملية تتم من داخل حساب العيادة.';

/** Parse the optional vital-sign / follow-up fields off a visit form. */
function vitalsFrom(formData: FormData) {
  const num = (key: string): number | null => {
    const raw = String(formData.get(key) || '').trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  return {
    temperature: num('temperature'),
    blood_pressure: String(formData.get('blood_pressure') || '').trim() || null,
    pulse: num('pulse'),
    weight: num('weight'),
    height: num('height'),
    followup_date: String(formData.get('followup_date') || '').trim() || null,
  };
}

export async function upsertPatient(formData: FormData): Promise<ActionResult> {
  const ctx = await requirePermission('clinic.manage');
  if (!ctx.companyId) return { ok: false, error: NO_COMPANY };
  const id = String(formData.get('id') || '').trim();
  const name = String(formData.get('name') || '').trim();
  if (!name) return { ok: false, error: 'اسم المريض مطلوب.' };
  const birth = String(formData.get('birth_date') || '').trim();
  const row = {
    code: String(formData.get('code') || '').trim() || null,
    name,
    phone: String(formData.get('phone') || '').trim() || null,
    gender: String(formData.get('gender') || '').trim() || null,
    birth_date: birth || null,
    blood_type: String(formData.get('blood_type') || '').trim() || null,
    allergies: String(formData.get('allergies') || '').trim() || null,
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
    doctor_id: String(formData.get('doctor_id') || '').trim() || ctx.userId,
    visit_type: String(formData.get('visit_type') || 'consultation'),
    complaint: String(formData.get('complaint') || '').trim() || null,
    diagnosis: String(formData.get('diagnosis') || '').trim() || null,
    prescription: String(formData.get('prescription') || '').trim() || null,
    fee: Number.isFinite(fee) && fee >= 0 ? fee : 0,
    status: 'waiting',
    ...vitalsFrom(formData),
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/clinic/visits');
  revalidatePath('/clinic');
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
  revalidatePath('/clinic');
  return { ok: true };
}

/** Update a visit's clinical fields (diagnosis / prescription) + mark done. */
export async function updateVisit(formData: FormData): Promise<ActionResult> {
  const ctx = await requirePermission('clinic.manage');
  if (!ctx.companyId) return { ok: false, error: NO_COMPANY };
  const id = String(formData.get('id') || '').trim();
  if (!id) return { ok: false, error: 'الكشف مطلوب.' };
  const vitals = vitalsFrom(formData);
  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_clinic_visits')
    .update({
      complaint: String(formData.get('complaint') || '').trim() || null,
      diagnosis: String(formData.get('diagnosis') || '').trim() || null,
      prescription: String(formData.get('prescription') || '').trim() || null,
      tests: String(formData.get('tests') || '').trim() || null,
      status: 'done',
      ...vitals,
    })
    .eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };

  // Optionally book the next visit as a real appointment so reception sees it.
  if (formData.get('book_followup') && vitals.followup_date) {
    const { data: v } = await supabase
      .from('erp_clinic_visits')
      .select('patient_id')
      .eq('id', id)
      .maybeSingle();
    const patientId = (v as { patient_id?: string } | null)?.patient_id;
    if (patientId) {
      await supabase.from('erp_clinic_appointments').insert({
        company_id: ctx.companyId,
        patient_id: patientId,
        doctor_id: ctx.userId,
        scheduled_at: new Date(`${vitals.followup_date}T10:00:00`).toISOString(),
        reason: 'متابعة',
        status: 'scheduled',
        created_by: ctx.userId,
      });
      revalidatePath('/clinic/appointments');
      revalidatePath('/clinic/reception');
    }
  }

  revalidatePath('/clinic/visits');
  revalidatePath('/clinic');
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
  revalidatePath('/clinic');
  return { ok: true };
}

// ─── Appointments (المواعيد) ────────────────────────────────────────────────

const APPT_STATUSES = ['scheduled', 'confirmed', 'arrived', 'done', 'cancelled', 'no_show'];

/** Book an appointment for a patient at a future date/time. */
export async function createAppointment(formData: FormData): Promise<ActionResult> {
  const ctx = await requirePermission('clinic.manage');
  if (!ctx.companyId) return { ok: false, error: NO_COMPANY };
  const patient_id = String(formData.get('patient_id') || '').trim();
  if (!patient_id) return { ok: false, error: 'اختر المريض.' };
  const when = String(formData.get('scheduled_at') || '').trim();
  if (!when) return { ok: false, error: 'حدّد موعد الحجز.' };
  const scheduled = new Date(when);
  if (isNaN(scheduled.getTime())) return { ok: false, error: 'تاريخ غير صحيح.' };
  const duration = Number(formData.get('duration_min') || 30);

  const supabase = await createClient();
  const { error } = await supabase.from('erp_clinic_appointments').insert({
    company_id: ctx.companyId,
    patient_id,
    doctor_id: String(formData.get('doctor_id') || '').trim() || ctx.userId,
    scheduled_at: scheduled.toISOString(),
    duration_min: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 30,
    reason: String(formData.get('reason') || '').trim() || null,
    status: 'scheduled',
    created_by: ctx.userId,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/clinic/appointments');
  revalidatePath('/clinic');
  return { ok: true };
}

export async function setAppointmentStatus(appointmentId: string, status: string): Promise<ActionResult> {
  const ctx = await requirePermission('clinic.manage');
  if (!ctx.companyId) return { ok: false, error: NO_COMPANY };
  if (!APPT_STATUSES.includes(status)) return { ok: false, error: 'حالة غير صحيحة.' };
  const supabase = await createClient();
  const { error } = await supabase.from('erp_clinic_appointments').update({ status }).eq('id', appointmentId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/clinic/appointments');
  revalidatePath('/clinic');
  return { ok: true };
}

/**
 * The patient arrived: open a visit (كشف) for them linked to the appointment
 * and mark the appointment as arrived. The visit then flows through the normal
 * exam/payment lifecycle on the visits screen.
 */
export async function checkInAppointment(formData: FormData): Promise<ActionResult> {
  const ctx = await requirePermission('clinic.manage');
  if (!ctx.companyId) return { ok: false, error: NO_COMPANY };
  const appointmentId = String(formData.get('appointment_id') || '').trim();
  if (!appointmentId) return { ok: false, error: 'الموعد مطلوب.' };
  const fee = Number(formData.get('fee') || 0);

  const supabase = await createClient();
  const { data: appt } = await supabase
    .from('erp_clinic_appointments')
    .select('patient_id, reason, status, doctor_id')
    .eq('id', appointmentId)
    .maybeSingle();
  const a = appt as { patient_id?: string; reason?: string | null; status?: string; doctor_id?: string | null } | null;
  if (!a?.patient_id) return { ok: false, error: 'الموعد غير موجود.' };
  if (a.status === 'done' || a.status === 'arrived')
    return { ok: false, error: 'تم تسجيل وصول هذا الموعد بالفعل.' };

  const { error: visitErr } = await supabase.from('erp_clinic_visits').insert({
    company_id: ctx.companyId,
    patient_id: a.patient_id,
    doctor_id: a.doctor_id || ctx.userId,
    appointment_id: appointmentId,
    visit_type: 'consultation',
    complaint: a.reason || null,
    fee: Number.isFinite(fee) && fee >= 0 ? fee : 0,
    status: 'waiting',
  });
  if (visitErr) return { ok: false, error: friendlyDbError(visitErr) };

  await supabase.from('erp_clinic_appointments').update({ status: 'arrived' }).eq('id', appointmentId);
  revalidatePath('/clinic/appointments');
  revalidatePath('/clinic/visits');
  revalidatePath('/clinic');
  return { ok: true };
}
