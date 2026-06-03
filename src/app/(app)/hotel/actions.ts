'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requirePermission, requireModuleAction } from '@/lib/erp/guards';
import { friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { getT } from '@/lib/i18n/server';

// Hotel / furnished-apartments: rooms + bookings. Every action requires the
// hotel.manage permission AND that the actor belongs to a company (the platform
// owner manages tenants, not their day-to-day data, so they have no company and
// cannot create rooms/bookings — we surface a clear message instead of letting
// the NOT NULL company_id constraint blow up).

const ROOM_STATUSES = ['available', 'occupied', 'cleaning', 'maintenance'] as const;

export async function createRoom(formData: FormData): Promise<ActionResult> {
  const ctx = await requirePermission('hotel.manage');
  const modErr = requireModuleAction(ctx, 'hotel');
  if (modErr) return modErr;
  const { t } = await getT();
  if (!ctx.companyId) return { ok: false, error: t('hotel.noCompanyAction') };
  const code = String(formData.get('code') || '').trim();
  const name = String(formData.get('name') || '').trim() || null;
  const room_type = String(formData.get('room_type') || '').trim() || null;
  const capacity = Number(formData.get('capacity') || 2);
  const nightly_rate = Number(formData.get('nightly_rate') || 0);
  if (!code) return { ok: false, error: t('hotel.errors.roomCodeRequired') };

  const supabase = await createClient();
  const { error } = await supabase.from('erp_rooms').insert({
    company_id: ctx.companyId,
    code, name, room_type,
    capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : 2,
    nightly_rate: Number.isFinite(nightly_rate) && nightly_rate >= 0 ? nightly_rate : 0,
  });
  if (error) {
    if (error.code === '23505') return { ok: false, error: t('hotel.errors.roomCodeDuplicate') };
    return { ok: false, error: friendlyDbError(error) };
  }
  revalidatePath('/hotel/rooms');
  return { ok: true };
}

export async function setRoomStatus(roomId: string, status: string): Promise<ActionResult> {
  const modErr = requireModuleAction(await requirePermission('hotel.manage'), 'hotel');
  if (modErr) return modErr;
  const { t } = await getT();
  if (!ROOM_STATUSES.includes(status as (typeof ROOM_STATUSES)[number]))
    return { ok: false, error: t('hotel.errors.invalidStatus') };
  const supabase = await createClient();
  const { error } = await supabase.from('erp_rooms').update({ status }).eq('id', roomId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/hotel/rooms');
  return { ok: true };
}

/** Create a booking. Validates the room is free for the requested dates. */
export async function createBooking(formData: FormData): Promise<ActionResult> {
  const ctx = await requirePermission('hotel.manage');
  const modErr = requireModuleAction(ctx, 'hotel');
  if (modErr) return modErr;
  const { t } = await getT();
  if (!ctx.companyId) return { ok: false, error: t('hotel.noCompanyAction') };
  const room_id = String(formData.get('room_id') || '').trim();
  const guest_name = String(formData.get('guest_name') || '').trim();
  const guest_phone = String(formData.get('guest_phone') || '').trim() || null;
  const check_in = String(formData.get('check_in') || '').trim();
  const check_out = String(formData.get('check_out') || '').trim();
  if (!room_id) return { ok: false, error: t('hotel.errors.roomRequired') };
  if (!guest_name) return { ok: false, error: t('hotel.errors.guestNameRequired') };
  if (!check_in || !check_out) return { ok: false, error: t('hotel.errors.datesRequired') };
  if (new Date(check_out) <= new Date(check_in))
    return { ok: false, error: t('hotel.errors.checkoutBeforeCheckin') };

  const supabase = await createClient();

  // overlap check: any active booking on the same room whose range intersects
  const { data: clashes } = await supabase
    .from('erp_bookings')
    .select('id')
    .eq('room_id', room_id)
    .in('status', ['reserved', 'checked_in'])
    .lt('check_in', check_out)
    .gt('check_out', check_in);
  if (clashes && clashes.length > 0)
    return { ok: false, error: t('hotel.errors.roomAlreadyBooked') };

  const { data: room } = await supabase
    .from('erp_rooms').select('nightly_rate').eq('id', room_id).maybeSingle();
  const rate = (room as { nightly_rate?: number } | null)?.nightly_rate ?? 0;
  const nights = Math.max(
    Math.round((new Date(check_out).getTime() - new Date(check_in).getTime()) / 86_400_000),
    1,
  );

  const { error } = await supabase.from('erp_bookings').insert({
    company_id: ctx.companyId,
    room_id, guest_name, guest_phone, check_in, check_out,
    nightly_rate: rate, total_amount: rate * nights, status: 'reserved',
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/hotel/bookings');
  revalidatePath('/hotel/rooms');
  return { ok: true };
}

/** Move a booking through its lifecycle and reflect room status. */
export async function setBookingStatus(bookingId: string, status: string): Promise<ActionResult> {
  const modErr = requireModuleAction(await requirePermission('hotel.manage'), 'hotel');
  if (modErr) return modErr;
  const { t } = await getT();
  const valid = ['reserved', 'checked_in', 'checked_out', 'cancelled'];
  if (!valid.includes(status)) return { ok: false, error: t('hotel.errors.invalidStatus') };

  const supabase = await createClient();
  const { data: booking } = await supabase
    .from('erp_bookings').select('room_id').eq('id', bookingId).maybeSingle();
  const roomId = (booking as { room_id?: string } | null)?.room_id;

  const { error } = await supabase.from('erp_bookings').update({ status }).eq('id', bookingId);
  if (error) return { ok: false, error: friendlyDbError(error) };

  // keep the room status in sync with the booking lifecycle
  if (roomId) {
    const roomStatus =
      status === 'checked_in' ? 'occupied'
      : status === 'checked_out' ? 'cleaning'
      : 'available'; // reserved / cancelled free the room
    await supabase.from('erp_rooms').update({ status: roomStatus }).eq('id', roomId);
  }
  revalidatePath('/hotel/bookings');
  revalidatePath('/hotel/rooms');
  return { ok: true };
}

/** Record a payment against a booking (adds to paid_amount). */
export async function addBookingPayment(bookingId: string, amount: number): Promise<ActionResult> {
  const modErr = requireModuleAction(await requirePermission('hotel.manage'), 'hotel');
  if (modErr) return modErr;
  const { t } = await getT();
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: t('hotel.errors.invalidAmount') };
  const supabase = await createClient();
  const { data: booking } = await supabase
    .from('erp_bookings').select('paid_amount').eq('id', bookingId).maybeSingle();
  const current = (booking as { paid_amount?: number } | null)?.paid_amount ?? 0;
  const { error } = await supabase
    .from('erp_bookings').update({ paid_amount: current + amount }).eq('id', bookingId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/hotel/bookings');
  return { ok: true };
}
