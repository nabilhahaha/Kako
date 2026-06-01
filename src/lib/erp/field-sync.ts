import 'server-only';

/** ── Field Execution offline sync core (FE-2b) ──────────────────────────────
 *  Pure, client-agnostic logic the offline outbox syncs through. Each queued
 *  action carries the time + GPS captured WHEN THE REP ACTED (`capturedAt`),
 *  which is passed straight to the idempotent RPCs and stored as-is — the row's
 *  created_at/updated_at remain the SYNC time, keeping captured vs. sync time
 *  cleanly separated. Items are de-duplicated and ordered (starts before ends)
 *  so a single batch can carry a full visit, and each item is processed in
 *  ISOLATION: one failure never aborts the rest (safe partial batch failures).
 *  Idempotency + duplicate-prevention come from the RPC's client_ref upsert, so
 *  reconnect/retry storms can re-send freely. */

export interface VisitStartAction {
  kind: 'start'; clientRef: string; customerId: string;
  lat?: number | null; lng?: number | null; accuracy?: number | null;
  capturedAt: string; routeId?: string | null; reason?: string | null; photo?: string | null;
}
export interface VisitEndAction {
  kind: 'end'; clientRef: string; lat?: number | null; lng?: number | null; capturedAt: string;
}
export type VisitAction = VisitStartAction | VisitEndAction;

export interface SyncItemResult {
  clientRef: string; kind: 'start' | 'end'; ok: boolean;
  idempotent?: boolean; id?: string; geofenceStatus?: string; distanceM?: number; durationMin?: number;
  error?: string; code?: SyncErrorCode;
}

/** Stable codes so the client can react: prompt the user (reason/photo), wait
 *  for a dependency (visit_not_found ⇒ its start hasn't synced yet), or retry. */
export type SyncErrorCode =
  | 'invalid' | 'reason_required' | 'photo_required' | 'visit_not_found'
  | 'customer_not_found' | 'no_company' | 'error';

interface RpcClient {
  // Supabase's .rpc() returns a thenable builder (PromiseLike), not a full Promise.
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

function errorCode(message: string): SyncErrorCode {
  const m = message.toLowerCase();
  if (m.includes('reason required')) return 'reason_required';
  if (m.includes('photo required')) return 'photo_required';
  if (m.includes('visit not found')) return 'visit_not_found';
  if (m.includes('customer not found')) return 'customer_not_found';
  if (m.includes('no company context')) return 'no_company';
  return 'error';
}

/** De-duplicate (by kind+clientRef, keep first) and order starts before ends, so
 *  a batch containing a visit's start AND end applies in the right sequence and
 *  a retried duplicate is collapsed before it ever hits the DB. */
export function normalizeBatch(items: VisitAction[]): VisitAction[] {
  const seen = new Set<string>();
  const deduped = items.filter((it) => {
    const k = `${it.kind}:${it.clientRef}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const rank = (it: VisitAction) => (it.kind === 'start' ? 0 : 1);
  return deduped
    .map((it, i) => [it, i] as const)
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
    .map(([it]) => it);
}

async function runStart(sb: RpcClient, it: VisitStartAction): Promise<SyncItemResult> {
  if (!it.clientRef || !it.customerId || !it.capturedAt) {
    return { clientRef: it.clientRef, kind: 'start', ok: false, code: 'invalid', error: 'missing clientRef/customerId/capturedAt' };
  }
  const { data, error } = await sb.rpc('erp_fe_visit_start', {
    p_client_ref: it.clientRef, p_customer: it.customerId,
    p_lat: it.lat ?? null, p_lng: it.lng ?? null, p_accuracy: it.accuracy ?? null,
    p_captured_at: it.capturedAt, p_route: it.routeId ?? null,
    p_reason: it.reason ?? null, p_photo: it.photo ?? null,
  });
  if (error) return { clientRef: it.clientRef, kind: 'start', ok: false, code: errorCode(error.message), error: error.message };
  const d = (data ?? {}) as { id?: string; geofence_status?: string; distance_m?: number; idempotent?: boolean };
  return { clientRef: it.clientRef, kind: 'start', ok: true, idempotent: !!d.idempotent, id: d.id, geofenceStatus: d.geofence_status, distanceM: d.distance_m };
}

async function runEnd(sb: RpcClient, it: VisitEndAction): Promise<SyncItemResult> {
  if (!it.clientRef || !it.capturedAt) {
    return { clientRef: it.clientRef, kind: 'end', ok: false, code: 'invalid', error: 'missing clientRef/capturedAt' };
  }
  const { data, error } = await sb.rpc('erp_fe_visit_end', {
    p_client_ref: it.clientRef, p_lat: it.lat ?? null, p_lng: it.lng ?? null, p_captured_at: it.capturedAt,
  });
  if (error) return { clientRef: it.clientRef, kind: 'end', ok: false, code: errorCode(error.message), error: error.message };
  const d = (data ?? {}) as { id?: string; duration_min?: number; idempotent?: boolean };
  return { clientRef: it.clientRef, kind: 'end', ok: true, idempotent: !!d.idempotent, id: d.id, durationMin: d.duration_min };
}

async function runItem(sb: RpcClient, it: VisitAction): Promise<SyncItemResult> {
  try {
    return it.kind === 'start' ? await runStart(sb, it) : await runEnd(sb, it);
  } catch (e) {
    // A thrown error on ONE item must never abort the batch.
    return { clientRef: it.clientRef, kind: it.kind, ok: false, code: 'error', error: (e as Error).message };
  }
}

/** Drain a batch idempotently, isolating per-item failures. Returns one result
 *  per (normalized) item; the client marks ok|idempotent items synced and
 *  retries the rest per their code. */
export async function syncVisitsWith(sb: RpcClient, items: VisitAction[]): Promise<SyncItemResult[]> {
  const results: SyncItemResult[] = [];
  for (const it of normalizeBatch(items)) results.push(await runItem(sb, it));
  return results;
}
