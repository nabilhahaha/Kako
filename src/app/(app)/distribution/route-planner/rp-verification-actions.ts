'use server';

// ============================================================================
// FV-2 — Field Customer Verification server actions. The rep verifies ONLY customers
// assigned to them (dataset_customers.salesman = the rep's email) and ONLY within 50 m of
// the customer's coordinates — enforced HERE on the server (not just the UI). One
// verification per customer (idempotent: UNIQUE(customer_id) → "verify once"). Old values
// are snapshotted from the customer master; the master is never silently overwritten.
// Company-scoped; erp_rp_customer_verifications RLS (0367) is the backstop.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { haversineMeters, isWithinRadius, validCoord } from '@/lib/erp/geo-distance';

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
type ResultD<T> = { ok: true; data: T } | { ok: false; error: string };

export interface NearbyCustomer {
  id: string; code: string | null; name: string;
  lat: number; lng: number; city: string | null; channel: string | null; phone: string | null;
  distanceM: number | null;
}
export interface MyProgress { total: number; completed: number; remaining: number; pct: number }

async function repCtx() {
  const ctx = await getUserContext();
  return ctx?.companyId ? ctx : null;
}
/** Assignment key: the demo assigns customers to a rep by the rep's email (salesman column). */
function repKey(ctx: NonNullable<Awaited<ReturnType<typeof getUserContext>>>): string | null {
  return (ctx.profile as { email?: string | null } | null)?.email ?? null;
}
const phoneOf = (attrs: unknown): string | null => {
  const p = (attrs as Record<string, unknown> | null)?.phone;
  return typeof p === 'string' && p.trim() ? p : null;
};

/** Customers assigned to me + my progress. When a GPS fix is supplied, the returned
 *  `nearby` list is filtered to UNVERIFIED customers within 50 m (sorted nearest-first). */
export async function getMyNearbyCustomers(gps?: { lat: number; lng: number } | null): Promise<ResultD<{ nearby: NearbyCustomer[]; progress: MyProgress; gpsValid: boolean }>> {
  const ctx = await repCtx();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const me = repKey(ctx);
  if (!me) return { ok: false, error: 'err_no_rep_key' };
  const sb = await createClient();

  const { data: custs, error } = await sb.from('erp_rp_dataset_customers')
    .select('id, code, name, lat, lng, city, channel, attrs')
    .eq('company_id', ctx.companyId).eq('salesman', me);
  if (error) return { ok: false, error: error.message };
  const customers = custs ?? [];

  const ids = customers.map((c) => c.id as string);
  let verified = new Set<string>();
  if (ids.length) {
    const { data: vrows } = await sb.from('erp_rp_customer_verifications')
      .select('customer_id').eq('company_id', ctx.companyId).in('customer_id', ids);
    verified = new Set((vrows ?? []).map((v) => v.customer_id as string));
  }

  const total = customers.length;
  const completed = customers.filter((c) => verified.has(c.id as string)).length;
  const remaining = total - completed;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const gpsValid = !!gps && validCoord(gps.lat, gps.lng);
  const nearby: NearbyCustomer[] = [];
  for (const c of customers) {
    if (verified.has(c.id as string)) continue;            // completed → not asked again
    const lat = c.lat as number | null, lng = c.lng as number | null;
    if (!validCoord(lat, lng)) continue;
    let distanceM: number | null = null;
    if (gpsValid) {
      const d = haversineMeters(gps!.lat, gps!.lng, lat as number, lng as number);
      if (!isWithinRadius(d)) continue;                    // only within 50 m
      distanceM = Math.round(d);
    }
    nearby.push({
      id: c.id as string, code: (c.code as string | null) ?? null, name: (c.name as string) ?? '',
      lat: lat as number, lng: lng as number, city: (c.city as string | null) ?? null,
      channel: (c.channel as string | null) ?? null, phone: phoneOf(c.attrs), distanceM,
    });
  }
  nearby.sort((a, b) => (a.distanceM ?? Number.POSITIVE_INFINITY) - (b.distanceM ?? Number.POSITIVE_INFINITY));
  return { ok: true, data: { nearby, progress: { total, completed, remaining, pct }, gpsValid } };
}

/** Submit a verification. Server-side: rep-assignment check + 50 m proximity lock +
 *  required fields + idempotency. Records old→new + photos + GPS + distance; never edits
 *  the customer master. */
export async function submitVerification(input: {
  customerId: string; gps: { lat: number; lng: number };
  city: string; channel: string; phone?: string | null;
  outsidePhotoId: string; insidePhotoIds?: string[]; notes?: string | null;
}): Promise<ResultD<{ id: string; distanceM: number }>> {
  const ctx = await repCtx();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const me = repKey(ctx);
  if (!me) return { ok: false, error: 'err_no_rep_key' };
  if (!input.city?.trim()) return { ok: false, error: 'err_city_required' };
  if (!input.channel?.trim()) return { ok: false, error: 'err_channel_required' };
  if (!input.outsidePhotoId) return { ok: false, error: 'err_outside_photo_required' };
  if (!validCoord(input.gps?.lat, input.gps?.lng)) return { ok: false, error: 'err_gps_required' };

  const sb = await createClient();
  const { data: c, error: e1 } = await sb.from('erp_rp_dataset_customers')
    .select('id, dataset_id, code, name, lat, lng, city, channel, attrs, salesman')
    .eq('id', input.customerId).eq('company_id', ctx.companyId).maybeSingle();
  if (e1 || !c) return { ok: false, error: 'err_customer_not_found' };
  if ((c.salesman as string | null) !== me) return { ok: false, error: 'err_not_assigned' };   // rep isolation
  const lat = c.lat as number | null, lng = c.lng as number | null;
  if (!validCoord(lat, lng)) return { ok: false, error: 'err_customer_no_coords' };

  const distanceM = haversineMeters(input.gps.lat, input.gps.lng, lat as number, lng as number);
  if (!isWithinRadius(distanceM)) return { ok: false, error: 'err_too_far' };                  // SERVER-SIDE 50 m lock

  const { data, error } = await sb.from('erp_rp_customer_verifications').insert({
    company_id: ctx.companyId, dataset_id: c.dataset_id, customer_id: c.id,
    customer_code: c.code, customer_name: c.name, rep_id: ctx.userId, status: 'verified',
    old_city: c.city, new_city: input.city.trim(),
    old_channel: c.channel, new_channel: input.channel.trim(),
    old_phone: phoneOf(c.attrs), new_phone: input.phone?.trim() || null,
    outside_photo: input.outsidePhotoId, inside_photos: input.insidePhotoIds ?? [],
    gps_lat: input.gps.lat, gps_lng: input.gps.lng, distance_m: Math.round(distanceM),
    notes: input.notes?.trim() || null, verified_by: ctx.userId,
  }).select('id').single();
  if (error) {
    if (error.code === '23505' || (error.message ?? '').includes('uq_rp_verif_customer')) {
      return { ok: false, error: 'err_already_verified' };                                     // idempotent
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, data: { id: data.id as string, distanceM: Math.round(distanceM) } };
}
