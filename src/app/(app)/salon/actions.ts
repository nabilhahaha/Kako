'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requirePermission, friendlyDbError, type ActionResult } from '@/lib/erp/guards';

// Salon / barber: services catalogue, bookings, and service tickets (the bill).
const NO_COMPANY = 'هذه العملية تتم من داخل حساب الصالون.';

function revalidate(ticketId?: string) {
  revalidatePath('/salon');
  revalidatePath('/salon/tickets');
  revalidatePath('/salon/appointments');
  if (ticketId) revalidatePath(`/salon/tickets/${ticketId}`);
}

// ─── Services ───────────────────────────────────────────────────────────────
export async function upsertService(formData: FormData): Promise<ActionResult> {
  const ctx = await requirePermission('salon.manage');
  if (!ctx.companyId) return { ok: false, error: NO_COMPANY };
  const id = String(formData.get('id') || '').trim();
  const name = String(formData.get('name') || '').trim();
  if (!name) return { ok: false, error: 'اسم الخدمة مطلوب.' };
  const price = Number(formData.get('price') || 0);
  const dur = Number(formData.get('duration_min') || 30);
  const row = {
    name,
    price: Number.isFinite(price) && price >= 0 ? price : 0,
    duration_min: Number.isFinite(dur) && dur > 0 ? Math.round(dur) : 30,
    is_active: String(formData.get('is_active') || 'true') !== 'false',
  };
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from('erp_salon_services').update(row).eq('id', id);
    if (error) return { ok: false, error: friendlyDbError(error) };
  } else {
    const { error } = await supabase.from('erp_salon_services').insert({ ...row, company_id: ctx.companyId });
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  revalidatePath('/salon/services');
  return { ok: true };
}

// ─── Appointments ─────────────────────────────────────────────────────────��─
export async function createAppointment(formData: FormData): Promise<ActionResult> {
  const ctx = await requirePermission('salon.manage');
  if (!ctx.companyId) return { ok: false, error: NO_COMPANY };
  const when = String(formData.get('scheduled_at') || '').trim();
  if (!when) return { ok: false, error: 'حدّد موعد الحجز.' };
  const scheduled = new Date(when);
  if (isNaN(scheduled.getTime())) return { ok: false, error: 'تاريخ غير صحيح.' };
  const dur = Number(formData.get('duration_min') || 30);
  const supabase = await createClient();
  const { error } = await supabase.from('erp_salon_appointments').insert({
    company_id: ctx.companyId,
    stylist_id: String(formData.get('stylist_id') || '').trim() || null,
    service_id: String(formData.get('service_id') || '').trim() || null,
    customer_name: String(formData.get('customer_name') || '').trim() || null,
    customer_phone: String(formData.get('customer_phone') || '').trim() || null,
    scheduled_at: scheduled.toISOString(),
    duration_min: Number.isFinite(dur) && dur > 0 ? Math.round(dur) : 30,
    status: 'scheduled',
    created_by: ctx.userId,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate();
  return { ok: true };
}

export async function setAppointmentStatus(id: string, status: string): Promise<ActionResult> {
  const ctx = await requirePermission('salon.manage');
  if (!ctx.companyId) return { ok: false, error: NO_COMPANY };
  if (!['scheduled', 'confirmed', 'arrived', 'done', 'cancelled', 'no_show'].includes(status)) return { ok: false, error: 'حالة غير صحيحة.' };
  const supabase = await createClient();
  const { error } = await supabase.from('erp_salon_appointments').update({ status }).eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate();
  return { ok: true };
}

/** Client arrived → open a ticket (with the booked service as first line). */
export async function checkInAppointment(appointmentId: string): Promise<ActionResult<string>> {
  const ctx = await requirePermission('salon.manage');
  if (!ctx.companyId) return { ok: false, error: NO_COMPANY };
  const supabase = await createClient();
  const { data: a } = await supabase
    .from('erp_salon_appointments')
    .select('stylist_id, service_id, customer_name, customer_phone, status')
    .eq('id', appointmentId).maybeSingle();
  const appt = a as { stylist_id: string | null; service_id: string | null; customer_name: string | null; customer_phone: string | null; status: string } | null;
  if (!appt) return { ok: false, error: 'الموعد غير موجود.' };
  if (appt.status === 'arrived' || appt.status === 'done') return { ok: false, error: 'تم تسجيل وصول هذا الموعد بالفعل.' };

  const { data: ticket, error } = await supabase.from('erp_salon_tickets').insert({
    company_id: ctx.companyId, appointment_id: appointmentId, stylist_id: appt.stylist_id,
    customer_name: appt.customer_name, customer_phone: appt.customer_phone, status: 'open', created_by: ctx.userId,
  }).select('id').single();
  if (error) return { ok: false, error: friendlyDbError(error) };
  const ticketId = (ticket as { id: string }).id;

  if (appt.service_id) {
    const { data: s } = await supabase.from('erp_salon_services').select('name, price').eq('id', appt.service_id).maybeSingle();
    const svc = s as { name: string; price: number } | null;
    if (svc) await supabase.from('erp_salon_ticket_items').insert({ company_id: ctx.companyId, ticket_id: ticketId, service_id: appt.service_id, name: svc.name, price: Number(svc.price || 0), qty: 1 });
  }
  await supabase.from('erp_salon_appointments').update({ status: 'arrived' }).eq('id', appointmentId);
  revalidate(ticketId);
  return { ok: true, data: ticketId };
}

// ─── Tickets ──────────────────────────────────────────────────────────────��─
export async function createTicket(input: { stylist_id?: string | null; customer_name?: string; customer_phone?: string }): Promise<ActionResult<string>> {
  const ctx = await requirePermission('salon.manage');
  if (!ctx.companyId) return { ok: false, error: NO_COMPANY };
  const supabase = await createClient();
  const { data, error } = await supabase.from('erp_salon_tickets').insert({
    company_id: ctx.companyId,
    stylist_id: input.stylist_id || null,
    customer_name: input.customer_name?.trim() || null,
    customer_phone: input.customer_phone?.trim() || null,
    status: 'open', created_by: ctx.userId,
  }).select('id').single();
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate();
  return { ok: true, data: (data as { id: string }).id };
}

export async function addTicketItem(ticketId: string, serviceId: string): Promise<ActionResult> {
  const ctx = await requirePermission('salon.manage');
  if (!ctx.companyId) return { ok: false, error: NO_COMPANY };
  const supabase = await createClient();
  const { data: s } = await supabase.from('erp_salon_services').select('name, price').eq('id', serviceId).maybeSingle();
  const svc = s as { name: string; price: number } | null;
  if (!svc) return { ok: false, error: 'الخدمة غير موجودة.' };
  const { data: existing } = await supabase.from('erp_salon_ticket_items').select('id, qty').eq('ticket_id', ticketId).eq('service_id', serviceId).maybeSingle();
  if (existing?.id) {
    const { error } = await supabase.from('erp_salon_ticket_items').update({ qty: Number((existing as { qty: number }).qty) + 1 }).eq('id', existing.id);
    if (error) return { ok: false, error: friendlyDbError(error) };
  } else {
    const { error } = await supabase.from('erp_salon_ticket_items').insert({ company_id: ctx.companyId, ticket_id: ticketId, service_id: serviceId, name: svc.name, price: Number(svc.price || 0), qty: 1 });
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  revalidate(ticketId);
  return { ok: true };
}

export async function setItemQty(itemId: string, qty: number, ticketId: string): Promise<ActionResult> {
  const ctx = await requirePermission('salon.manage');
  if (!ctx.companyId) return { ok: false, error: NO_COMPANY };
  const supabase = await createClient();
  if (qty <= 0) {
    const { error } = await supabase.from('erp_salon_ticket_items').delete().eq('id', itemId);
    if (error) return { ok: false, error: friendlyDbError(error) };
  } else {
    const { error } = await supabase.from('erp_salon_ticket_items').update({ qty: Math.round(qty) }).eq('id', itemId);
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  revalidate(ticketId);
  return { ok: true };
}

export async function updateTicketMeta(formData: FormData): Promise<ActionResult> {
  const ctx = await requirePermission('salon.manage');
  if (!ctx.companyId) return { ok: false, error: NO_COMPANY };
  const id = String(formData.get('id') || '').trim();
  if (!id) return { ok: false, error: 'التذكرة مطلوبة.' };
  const disc = Number(formData.get('discount_value') || 0);
  const supabase = await createClient();
  const { error } = await supabase.from('erp_salon_tickets').update({
    stylist_id: String(formData.get('stylist_id') || '').trim() || null,
    customer_name: String(formData.get('customer_name') || '').trim() || null,
    customer_phone: String(formData.get('customer_phone') || '').trim() || null,
    discount_value: Number.isFinite(disc) && disc >= 0 ? disc : 0,
  }).eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate(id);
  return { ok: true };
}

export async function closeTicket(ticketId: string, paymentMethod = 'cash'): Promise<ActionResult> {
  const ctx = await requirePermission('salon.manage');
  if (!ctx.companyId) return { ok: false, error: NO_COMPANY };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_close_salon_ticket', { p_ticket_id: ticketId, p_payment_method: paymentMethod === 'card' ? 'card' : 'cash' });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate(ticketId);
  return { ok: true };
}

export async function cancelTicket(ticketId: string): Promise<ActionResult> {
  const ctx = await requirePermission('salon.manage');
  if (!ctx.companyId) return { ok: false, error: NO_COMPANY };
  const supabase = await createClient();
  const { data: t } = await supabase.from('erp_salon_tickets').select('status').eq('id', ticketId).maybeSingle();
  if ((t as { status: string } | null)?.status === 'closed') return { ok: false, error: 'لا يمكن إلغاء تذكرة مغلقة.' };
  const { error } = await supabase.from('erp_salon_tickets').update({ status: 'cancelled' }).eq('id', ticketId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidate(ticketId);
  return { ok: true };
}
