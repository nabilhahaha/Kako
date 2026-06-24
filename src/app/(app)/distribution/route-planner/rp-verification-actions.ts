'use server';

// ============================================================================
// FV-2 — Field Customer Verification server actions. The rep verifies ONLY customers
// assigned to them (dataset_customers.salesman = the rep's email) and ONLY within the
// company-configured proximity radius (getCompanyRadiusM; default 50 m) of the customer's
// coordinates — enforced HERE on the server (not just the UI). One
// verification per customer (idempotent: UNIQUE(customer_id) → "verify once"). Old values
// are snapshotted from the customer master; the master is never silently overwritten.
// Company-scoped; erp_rp_customer_verifications RLS (0367) is the backstop.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { haversineMeters, isWithinRadius, validCoord } from '@/lib/erp/geo-distance';
import { getCompanyRadiusM } from './rp-verification-radius-actions';
import { getFvVerificationForm } from './rp-verification-form-actions';
import type { FvMapPoint } from './fv-map-helpers';
import { ATTACHMENTS_BUCKET } from '@/lib/erp/attachments';
import { chunk } from '@/lib/utils';

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
type ResultD<T> = { ok: true; data: T } | { ok: false; error: string };

/** Archived dataset ids for the company — their customers are hidden from rep active work
 *  (Nearby / Assigned / Map). Empty when nothing is archived, so the rep queries below stay
 *  byte-identical to today (no behavior change until an admin archives a list). */
async function archivedDatasetIds(
  sb: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
): Promise<string[]> {
  const { data } = await sb.from('erp_rp_datasets').select('id').eq('company_id', companyId).eq('status', 'archived');
  return (data ?? []).map((d) => d.id as string);
}

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

type AttemptResult = 'verified' | 'outside_radius' | 'not_assigned' | 'no_coords' | 'error';
/** Audit trail for field verification attempts (FV-3b). Rejected + successful attempts are
 *  recorded for the FV-4 exception report. Best-effort: a logging failure never blocks the
 *  user-facing flow (RLS already restricts the row to the rep's own company + id). */
async function logAttempt(
  sb: Awaited<ReturnType<typeof createClient>>,
  ctx: NonNullable<Awaited<ReturnType<typeof getUserContext>>>,
  a: { customerId?: string | null; gps?: { lat: number; lng: number } | null; distanceM?: number | null; allowedRadiusM?: number | null; result: AttemptResult; reason?: string },
): Promise<void> {
  try {
    await sb.from('erp_rp_verification_attempts').insert({
      company_id: ctx.companyId, customer_id: a.customerId ?? null, rep_id: ctx.userId,
      gps_lat: a.gps?.lat ?? null, gps_lng: a.gps?.lng ?? null,
      distance_m: a.distanceM ?? null, allowed_radius_m: a.allowedRadiusM ?? null,
      result: a.result, reason: a.reason ?? null,
    });
  } catch { /* audit is best-effort; never fail the verification on a log error */ }
}

/** Customers assigned to me + my progress. When a GPS fix is supplied, the returned
 *  `nearby` list is filtered to UNVERIFIED customers within the company-configured radius
 *  (returned as `radiusM`, the single source of truth for header/empty-state/filter). */
export async function getMyNearbyCustomers(gps?: { lat: number; lng: number } | null): Promise<ResultD<{ nearby: NearbyCustomer[]; assigned: NearbyCustomer[]; progress: MyProgress; gpsValid: boolean; radiusM: number }>> {
  const ctx = await repCtx();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const me = repKey(ctx);
  if (!me) return { ok: false, error: 'err_no_rep_key' };
  const sb = await createClient();
  const radiusM = await getCompanyRadiusM(ctx.companyId!);   // company-configured proximity (default 50 m)

  const archived = await archivedDatasetIds(sb, ctx.companyId!);
  let custQ = sb.from('erp_rp_dataset_customers')
    .select('id, code, name, lat, lng, city, channel, attrs')
    .eq('company_id', ctx.companyId).eq('salesman', me);
  if (archived.length) custQ = custQ.not('dataset_id', 'in', `(${archived.join(',')})`);
  const { data: custs, error } = await custQ;
  if (error) return { ok: false, error: error.message };
  const customers = custs ?? [];

  // Which of my customers are already verified. Scope by rep_id (my own verifications —
  // the only ones RLS lets a rep read anyway) instead of a `.in('customer_id', [..2000+])`
  // filter, which PostgREST serialises into the request URL and overflows the gateway limit
  // for a rep with many assigned customers — silently returning nothing, so Completed stayed
  // 0 and verified customers never dropped off the list.
  const verified = new Set<string>();
  {
    const { data: vrows, error: vErr } = await sb.from('erp_rp_customer_verifications')
      .select('customer_id').eq('company_id', ctx.companyId).eq('rep_id', ctx.userId);
    if (vErr) return { ok: false, error: vErr.message };
    for (const v of vrows ?? []) verified.add(v.customer_id as string);
  }

  const total = customers.length;
  const completed = customers.filter((c) => verified.has(c.id as string)).length;
  const remaining = total - completed;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const gpsValid = !!gps && validCoord(gps.lat, gps.lng);
  const nearby: NearbyCustomer[] = [];
  const assigned: NearbyCustomer[] = [];
  for (const c of customers) {
    if (verified.has(c.id as string)) continue;            // completed → excluded from both lists
    const lat = c.lat as number | null, lng = c.lng as number | null;
    if (!validCoord(lat, lng)) continue;                   // unverifiable without coordinates
    let distanceM: number | null = null;
    let within = !gpsValid;                                // no GPS fix → list everything (unchanged)
    if (gpsValid) {
      const d = haversineMeters(gps!.lat, gps!.lng, lat as number, lng as number);
      distanceM = Math.round(d);
      within = isWithinRadius(d, radiusM);                 // gate Nearby to the configured radius
    }
    const row: NearbyCustomer = {
      id: c.id as string, code: (c.code as string | null) ?? null, name: (c.name as string) ?? '',
      lat: lat as number, lng: lng as number, city: (c.city as string | null) ?? null,
      channel: (c.channel as string | null) ?? null, phone: phoneOf(c.attrs), distanceM,
    };
    // Assigned List: EVERY unverified customer assigned to me — searchable + openable
    // regardless of distance. Nearby: the same rows gated to the configured radius (when a
    // GPS fix is present). Final submit still enforces the radius + photo rule server-side.
    assigned.push(row);
    if (within) nearby.push(row);
  }
  nearby.sort((a, b) => (a.distanceM ?? Number.POSITIVE_INFINITY) - (b.distanceM ?? Number.POSITIVE_INFINITY));
  assigned.sort((a, b) => (a.code ?? a.name).localeCompare(b.code ?? b.name));
  return { ok: true, data: { nearby, assigned, progress: { total, completed, remaining, pct }, gpsValid, radiusM } };
}

/** All customers assigned to me, WITH verification status — the Map tab data source.
 *  Unlike getMyNearbyCustomers this keeps completed customers (green markers) and does not
 *  filter by distance. Rep- + company-scoped exactly like the rest of the FV flow
 *  (erp_rp_customer_verifications + erp_rp_dataset_customers RLS are the backstop). Read-only:
 *  no submit / radius / photo logic. */
export async function getMyMapCustomers(): Promise<ResultD<FvMapPoint[]>> {
  const ctx = await repCtx();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const me = repKey(ctx);
  if (!me) return { ok: false, error: 'err_no_rep_key' };
  const sb = await createClient();

  const archived = await archivedDatasetIds(sb, ctx.companyId!);
  let custQ = sb.from('erp_rp_dataset_customers')
    .select('id, code, name, lat, lng, city, channel')
    .eq('company_id', ctx.companyId).eq('salesman', me);
  if (archived.length) custQ = custQ.not('dataset_id', 'in', `(${archived.join(',')})`);
  const { data: custs, error } = await custQ;
  if (error) return { ok: false, error: error.message };

  // My verifications → completed set + last verified time per customer. Rep-scoped (the only
  // rows RLS lets a rep read) instead of a `.in('customer_id', [..2000+])` filter, which would
  // overflow the gateway URL for a rep with many assigned customers.
  const lastVerifiedAt = new Map<string, string>();
  {
    const { data: vrows, error: vErr } = await sb.from('erp_rp_customer_verifications')
      .select('customer_id, verified_at, created_at').eq('company_id', ctx.companyId).eq('rep_id', ctx.userId);
    if (vErr) return { ok: false, error: vErr.message };
    for (const v of vrows ?? []) {
      const id = v.customer_id as string;
      const at = ((v.verified_at as string | null) ?? (v.created_at as string | null)) ?? null;
      if (at && (!lastVerifiedAt.has(id) || at > (lastVerifiedAt.get(id) as string))) lastVerifiedAt.set(id, at);
    }
  }

  const points: FvMapPoint[] = [];
  for (const c of custs ?? []) {
    const lat = c.lat as number | null, lng = c.lng as number | null;
    if (!validCoord(lat, lng)) continue;                     // unmappable without coordinates
    const id = c.id as string;
    const completed = lastVerifiedAt.has(id);
    points.push({
      id, code: (c.code as string | null) ?? null, name: (c.name as string) ?? '',
      lat: lat as number, lng: lng as number,
      city: (c.city as string | null) ?? null, channel: (c.channel as string | null) ?? null,
      completed, lastVerifiedAt: completed ? (lastVerifiedAt.get(id) as string) : null,
    });
  }
  return { ok: true, data: points };
}

/** Submit a verification. Server-side: rep-assignment check + 50 m proximity lock +
 *  required fields + idempotency. Records old→new + photos + GPS + distance; never edits
 *  the customer master. */
export async function submitVerification(input: {
  customerId: string; gps?: { lat: number; lng: number } | null;
  city: string; channel: string; phone?: string | null;
  outsidePhotoId?: string | null; insidePhotoIds?: string[]; notes?: string | null;
}): Promise<ResultD<{ id: string; distanceM: number }>> {
  const ctx = await repCtx();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const me = repKey(ctx);
  if (!me) return { ok: false, error: 'err_no_rep_key' };

  // Submit follows the published form config (Form Builder Phase 1): which fields are
  // required, and whether the GPS/radius lock applies. Unconfigured → defaults = today's
  // behavior (city/channel/outside photo required + radius enforced).
  const cfg = await getFvVerificationForm();
  const fieldRequired = (k: 'city' | 'channel' | 'outside_photo'): boolean =>
    cfg.ok ? (cfg.data.fields.find((f) => f.key === k)?.required ?? true) : true;
  const requireGps = cfg.ok ? cfg.data.requireGps : true;

  const newCity = input.city?.trim() || '';
  const newChannel = input.channel?.trim() || '';
  if (fieldRequired('city') && !newCity) return { ok: false, error: 'err_city_required' };
  if (fieldRequired('channel') && !newChannel) return { ok: false, error: 'err_channel_required' };
  if (fieldRequired('outside_photo') && !input.outsidePhotoId) return { ok: false, error: 'err_outside_photo_required' };
  const gpsValid = validCoord(input.gps?.lat, input.gps?.lng);
  if (requireGps && !gpsValid) return { ok: false, error: 'err_gps_required' };

  const sb = await createClient();
  const radiusM = await getCompanyRadiusM(ctx.companyId!);   // company-configured proximity (default 50 m)
  const { data: c, error: e1 } = await sb.from('erp_rp_dataset_customers')
    .select('id, dataset_id, code, name, lat, lng, city, channel, attrs, salesman')
    .eq('id', input.customerId).eq('company_id', ctx.companyId).maybeSingle();
  if (e1 || !c) return { ok: false, error: 'err_customer_not_found' };
  if ((c.salesman as string | null) !== me) {                                                  // rep isolation
    await logAttempt(sb, ctx, { customerId: input.customerId, gps: input.gps, allowedRadiusM: radiusM, result: 'not_assigned' });
    return { ok: false, error: 'err_not_assigned' };
  }
  const lat = c.lat as number | null, lng = c.lng as number | null;
  const custCoordsOk = validCoord(lat, lng);
  if (requireGps && !custCoordsOk) {
    await logAttempt(sb, ctx, { customerId: c.id as string, gps: input.gps, allowedRadiusM: radiusM, result: 'no_coords', reason: 'customer_no_coords' });
    return { ok: false, error: 'err_customer_no_coords' };
  }

  // Distance is recorded when both fixes are present; the radius LOCK is enforced only when
  // the form requires GPS (the default). When requireGps is off, submit does not gate on
  // proximity (but still records distance if available).
  const distanceM = (gpsValid && custCoordsOk)
    ? haversineMeters(input.gps!.lat, input.gps!.lng, lat as number, lng as number)
    : null;
  if (requireGps && (distanceM == null || !isWithinRadius(distanceM, radiusM))) {               // SERVER-SIDE proximity lock
    await logAttempt(sb, ctx, { customerId: c.id as string, gps: input.gps, distanceM: distanceM != null ? Math.round(distanceM) : null, allowedRadiusM: radiusM, result: 'outside_radius' });
    return { ok: false, error: distanceM == null ? 'err_gps_required' : 'err_too_far' };
  }

  // FV-4d — City/Channel must be ACTIVE values from the admin-managed catalog (no free typing).
  // Validated only when a value is provided (a field may be optional/hidden per the config).
  const { data: catalog } = await sb.from('erp_rp_verification_catalog')
    .select('kind, value').eq('company_id', ctx.companyId).eq('active', true);
  const cities = new Set((catalog ?? []).filter((r) => r.kind === 'city').map((r) => r.value as string));
  const channels = new Set((catalog ?? []).filter((r) => r.kind === 'channel').map((r) => r.value as string));
  if (newCity && !cities.has(newCity)) return { ok: false, error: 'err_city_invalid' };
  if (newChannel && !channels.has(newChannel)) return { ok: false, error: 'err_channel_invalid' };

  const roundedDist = distanceM != null ? Math.round(distanceM) : null;
  const { data, error } = await sb.from('erp_rp_customer_verifications').insert({
    company_id: ctx.companyId, dataset_id: c.dataset_id, customer_id: c.id,
    customer_code: c.code, customer_name: c.name, rep_id: ctx.userId, status: 'verified',
    old_city: c.city, new_city: newCity || null,
    old_channel: c.channel, new_channel: newChannel || null,
    old_phone: phoneOf(c.attrs), new_phone: input.phone?.trim() || null,
    outside_photo: input.outsidePhotoId || null, inside_photos: input.insidePhotoIds ?? [],
    gps_lat: gpsValid ? input.gps!.lat : null, gps_lng: gpsValid ? input.gps!.lng : null, distance_m: roundedDist,
    allowed_radius_m: radiusM,                                                                  // radius in force at submit time
    notes: input.notes?.trim() || null, verified_by: ctx.userId,
  }).select('id').single();
  if (error) {
    if (error.code === '23505' || (error.message ?? '').includes('uq_rp_verif_customer')) {
      return { ok: false, error: 'err_already_verified' };                                     // idempotent
    }
    return { ok: false, error: error.message };
  }
  await logAttempt(sb, ctx, { customerId: c.id as string, gps: input.gps, distanceM: roundedDist, allowedRadiusM: radiusM, result: 'verified' });
  return { ok: true, data: { id: data.id as string, distanceM: roundedDist ?? 0 } };
}

/** A verification the logged-in rep already completed — the "Completed" tab + read-only
 *  detail. Source: erp_rp_customer_verifications (the same immutable rows the submit writes
 *  and the admin report reads). Scoped to the rep's OWN rows (rep_id = me); RLS (rp_verif_sel:
 *  rep_id = auth.uid()) is the backstop, so other reps' completions are never returned. */
export interface CompletedVerification {
  id: string; customerId: string; code: string | null; name: string;
  oldCity: string | null; newCity: string | null;
  oldChannel: string | null; newChannel: string | null;
  oldPhone: string | null; newPhone: string | null;
  notes: string | null; distanceM: number | null; allowedRadiusM: number | null;
  verifiedAt: string; status: string; repName: string; repEmail: string;
  outsidePhotoId: string | null; insidePhotoIds: string[];
}

export async function getMyCompletedVerifications(): Promise<ResultD<CompletedVerification[]>> {
  const ctx = await repCtx();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const sb = await createClient();
  const { data: rows, error } = await sb.from('erp_rp_customer_verifications')
    .select('id, customer_id, customer_code, customer_name, old_city, new_city, old_channel, new_channel, old_phone, new_phone, notes, distance_m, allowed_radius_m, status, verified_at, created_at, outside_photo, inside_photos')
    .eq('company_id', ctx.companyId).eq('rep_id', ctx.userId)
    .order('created_at', { ascending: false }).limit(500);   // latest first
  if (error) return { ok: false, error: error.message };
  const repEmail = repKey(ctx) ?? '';
  const repName = (ctx.profile as { full_name?: string | null } | null)?.full_name || repEmail;
  return {
    ok: true,
    data: (rows ?? []).map((r) => ({
      id: r.id as string, customerId: r.customer_id as string,
      code: (r.customer_code as string | null) ?? null, name: (r.customer_name as string) ?? '',
      oldCity: (r.old_city as string | null) ?? null, newCity: (r.new_city as string | null) ?? null,
      oldChannel: (r.old_channel as string | null) ?? null, newChannel: (r.new_channel as string | null) ?? null,
      oldPhone: (r.old_phone as string | null) ?? null, newPhone: (r.new_phone as string | null) ?? null,
      notes: (r.notes as string | null) ?? null,
      distanceM: (r.distance_m as number | null) ?? null, allowedRadiusM: (r.allowed_radius_m as number | null) ?? null,
      verifiedAt: ((r.verified_at as string | null) ?? (r.created_at as string)) as string,
      status: (r.status as string | null) ?? 'verified', repName, repEmail,
      outsidePhotoId: (r.outside_photo as string | null) ?? null,
      insidePhotoIds: ((r.inside_photos as string[] | null) ?? []),
    })),
  };
}

/** Resolve attachment ids → short-lived signed URLs for the read-only verification detail.
 *  Company-scoped (erp_attachments tenant RLS) + batched (the `.in()` filter is URL-encoded).
 *  Read-only: never mutates the verification or the attachment. */
export async function getVerificationPhotos(ids: string[]): Promise<ResultD<{ id: string; url: string }[]>> {
  const ctx = await repCtx();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  const clean = [...new Set((ids ?? []).filter((x) => typeof x === 'string' && x))];
  if (clean.length === 0) return { ok: true, data: [] };
  const sb = await createClient();
  const out: { id: string; url: string }[] = [];
  for (const batch of chunk(clean)) {
    const { data: atts } = await sb.from('erp_attachments')
      .select('id, path').in('id', batch).eq('company_id', ctx.companyId).is('deleted_at', null);
    for (const a of atts ?? []) {
      const { data: signed } = await sb.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(a.path as string, 3600);
      if (signed?.signedUrl) out.push({ id: a.id as string, url: signed.signedUrl });
    }
  }
  return { ok: true, data: out };
}
