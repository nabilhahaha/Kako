'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAnyPermission } from '@/lib/erp/guards';
import { friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import type { Permission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';

// Who may do what in the clinic. clinic.manage (admin/manager) implies all.
const ANY_CLINIC: Permission[] = ['clinic.manage', 'clinic.reception', 'clinic.doctor'];
const RECEPTION: Permission[] = ['clinic.manage', 'clinic.reception'];
const DOCTOR: Permission[] = ['clinic.manage', 'clinic.doctor'];

// Clinic: patients + visits (كشف). All actions require clinic.manage and a
// company (the platform owner has none). company_id is set explicitly from the
// caller's context (tenant isolation also enforced by RLS).

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
  const { t } = await getT();
  const ctx = await requireAnyPermission(ANY_CLINIC);
  if (!ctx.companyId) return { ok: false, error: t('clinic.errors.noCompany') };
  const id = String(formData.get('id') || '').trim();
  const name = String(formData.get('name') || '').trim();
  if (!name) return { ok: false, error: t('clinic.errors.patientNameRequired') };
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
/** Resolve which doctor a new visit/appointment is assigned to: the one the
 *  receptionist picked → else the creator if they're a doctor → else the single
 *  (or first) doctor in the clinic → else the creator. Ensures a receptionist's
 *  check-in always lands in a real doctor's queue. */
async function pickDoctor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  formData: FormData,
  userId: string,
): Promise<string> {
  const picked = String(formData.get('doctor_id') || '').trim();
  if (picked) return picked;
  const { data } = await supabase.rpc('erp_clinic_doctors');
  const list = (data as { id: string }[] | null) ?? [];
  if (list.some((d) => d.id === userId)) return userId;
  if (list.length >= 1) return list[0].id;
  return userId;
}

export async function createVisit(formData: FormData): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requireAnyPermission(ANY_CLINIC);
  if (!ctx.companyId) return { ok: false, error: t('clinic.errors.noCompany') };
  const patient_id = String(formData.get('patient_id') || '').trim();
  if (!patient_id) return { ok: false, error: t('clinic.errors.patientRequired') };
  const fee = Number(formData.get('fee') || 0);

  const supabase = await createClient();
  const { error } = await supabase.from('erp_clinic_visits').insert({
    company_id: ctx.companyId,
    patient_id,
    doctor_id: await pickDoctor(supabase, formData, ctx.userId),
    visit_type: String(formData.get('visit_type') || 'consultation'),
    complaint: String(formData.get('complaint') || '').trim() || null,
    diagnosis: String(formData.get('diagnosis') || '').trim() || null,
    prescription: String(formData.get('prescription') || '').trim() || null,
    service_id: String(formData.get('service_id') || '').trim() || null,
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
  const { t } = await getT();
  const ctx = await requireAnyPermission(ANY_CLINIC);
  if (!ctx.companyId) return { ok: false, error: t('clinic.errors.noCompany') };
  if (!['waiting', 'in_progress', 'done', 'cancelled'].includes(status))
    return { ok: false, error: t('clinic.errors.invalidStatus') };
  const supabase = await createClient();
  const { error } = await supabase.from('erp_clinic_visits').update({ status }).eq('id', visitId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/clinic/visits');
  revalidatePath('/clinic');
  return { ok: true };
}

/** Update a visit's clinical fields (diagnosis / prescription) + mark done. */
export async function updateVisit(formData: FormData): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requireAnyPermission(DOCTOR);
  if (!ctx.companyId) return { ok: false, error: t('clinic.errors.noCompany') };
  const id = String(formData.get('id') || '').trim();
  if (!id) return { ok: false, error: t('clinic.errors.visitRequired') };
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
        reason: t('clinic.followupReason'),
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
  const { t } = await getT();
  const ctx = await requireAnyPermission(RECEPTION);
  if (!ctx.companyId) return { ok: false, error: t('clinic.errors.noCompany') };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: t('clinic.errors.invalidAmount') };
  const supabase = await createClient();
  // Atomically records the collection AND posts Debit Cash / Credit Service
  // Revenue to the accounting journal (so clinic income hits financial reports).
  const { error } = await supabase.rpc('erp_collect_clinic_fee', { p_visit_id: visitId, p_amount: amount });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/clinic/visits');
  revalidatePath('/clinic');
  return { ok: true };
}

// ─── Services catalogue ──────────────────────────────────────────────────────

export async function upsertService(formData: FormData): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requireAnyPermission(['clinic.manage']);
  if (!ctx.companyId) return { ok: false, error: t('clinic.errors.noCompany') };
  const id = String(formData.get('id') || '').trim();
  const name = String(formData.get('name') || '').trim();
  if (!name) return { ok: false, error: t('clinic.errors.serviceNameRequired') };
  const price = Number(formData.get('price') || 0);
  const row = {
    name,
    price: Number.isFinite(price) && price >= 0 ? price : 0,
    is_active: String(formData.get('is_active') || 'true') !== 'false',
  };
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from('erp_clinic_services').update(row).eq('id', id);
    if (error) return { ok: false, error: friendlyDbError(error) };
  } else {
    const { error } = await supabase.from('erp_clinic_services').insert({ ...row, company_id: ctx.companyId });
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  revalidatePath('/clinic/services');
  return { ok: true };
}

// ─── Appointments ─────────────────────────────────────────────────────────────

const APPT_STATUSES = ['scheduled', 'confirmed', 'arrived', 'done', 'cancelled', 'no_show'];

/** Book an appointment for a patient at a future date/time. */
export async function createAppointment(formData: FormData): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requireAnyPermission(RECEPTION);
  if (!ctx.companyId) return { ok: false, error: t('clinic.errors.noCompany') };
  const patient_id = String(formData.get('patient_id') || '').trim();
  if (!patient_id) return { ok: false, error: t('clinic.errors.patientRequired') };
  const when = String(formData.get('scheduled_at') || '').trim();
  if (!when) return { ok: false, error: t('clinic.errors.appointmentTimeRequired') };
  const scheduled = new Date(when);
  if (isNaN(scheduled.getTime())) return { ok: false, error: t('clinic.errors.invalidDate') };
  const duration = Number(formData.get('duration_min') || 30);

  const supabase = await createClient();
  const { error } = await supabase.from('erp_clinic_appointments').insert({
    company_id: ctx.companyId,
    patient_id,
    doctor_id: await pickDoctor(supabase, formData, ctx.userId),
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
  const { t } = await getT();
  const ctx = await requireAnyPermission(RECEPTION);
  if (!ctx.companyId) return { ok: false, error: t('clinic.errors.noCompany') };
  if (!APPT_STATUSES.includes(status)) return { ok: false, error: t('clinic.errors.invalidStatus') };
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
  const { t } = await getT();
  const ctx = await requireAnyPermission(RECEPTION);
  if (!ctx.companyId) return { ok: false, error: t('clinic.errors.noCompany') };
  const appointmentId = String(formData.get('appointment_id') || '').trim();
  if (!appointmentId) return { ok: false, error: t('clinic.errors.appointmentRequired') };
  const fee = Number(formData.get('fee') || 0);

  const supabase = await createClient();
  const { data: appt } = await supabase
    .from('erp_clinic_appointments')
    .select('patient_id, reason, status, doctor_id')
    .eq('id', appointmentId)
    .maybeSingle();
  const a = appt as { patient_id?: string; reason?: string | null; status?: string; doctor_id?: string | null } | null;
  if (!a?.patient_id) return { ok: false, error: t('clinic.errors.appointmentNotFound') };
  if (a.status === 'done' || a.status === 'arrived')
    return { ok: false, error: t('clinic.errors.appointmentAlreadyArrived') };

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
