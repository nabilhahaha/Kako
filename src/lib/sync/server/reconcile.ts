// ============================================================================
// sync_rows → business-tables reconciliation engine (design §15 P3).
//
// Offline-created operational records land in the cloud mirror (`sync_rows`) on
// reconnect. This worker materializes them into the real business tables so they
// become first-class records. Pure orchestration over an injected `ReconcileDeps`
// + a per-entity `ReconcileHandler` registry, so idempotency, retry/backoff,
// dead-lettering, status and the audit trail are fully unit-testable without a
// database. The route (src/app/api/sync/reconcile) wires deps to Supabase.
//
// Guarantees:
//  • No duplicates / idempotent — a record already 'done' in the reconcile ledger
//    is skipped; handlers are independently idempotent (offline pk == business id,
//    or the action's own idempotency_key), so even a crash between materialize and
//    markDone cannot double-create.
//  • Failed records are retriable with capped exponential backoff, then dead-letter
//    (a visible terminal 'failed' state) — never silently dropped.
//  • Audit trail — every attempt is recorded by the deps (markDone/markFailed →
//    sync_reconcile_log) and the materialized row keeps its own created_by/origin.
//
// Behind KAKO_SYNC; the mirror + ledger tables don't exist in production.
// ============================================================================

export interface MirrorRecord {
  companyId: string;
  entity: string;
  pk: string;
  data: Record<string, unknown>;
  deleted: boolean;
}

export type ReconcileStatus = 'pending' | 'done' | 'failed' | 'skipped';

export interface ReconcileState {
  status: ReconcileStatus;
  attempts: number;
}

/** Materializes one mirror record into the business tables, idempotently,
 *  returning the resulting business row id (or null if nothing was created). */
export interface ReconcileHandler {
  materialize(rec: MirrorRecord): Promise<{ businessId: string | null }>;
}

export interface ReconcileDeps {
  /** Mirror records due for reconciliation (ledger status pending/failed & due now). */
  due(limit: number): Promise<MirrorRecord[]>;
  /** Current ledger state for a record, or null if never seen. */
  getState(rec: MirrorRecord): Promise<ReconcileState | null>;
  markDone(rec: MirrorRecord, businessId: string | null, attempts: number): Promise<void>;
  markFailed(rec: MirrorRecord, attempts: number, error: string, nextAttemptAt: number, deadLetter: boolean): Promise<void>;
  markSkipped(rec: MirrorRecord, reason: string): Promise<void>;
}

export interface ReconcileOutcome {
  companyId: string;
  entity: string;
  pk: string;
  status: 'done' | 'failed' | 'skipped';
  businessId?: string | null;
  alreadyDone?: boolean;
  deadLetter?: boolean;
  reason?: string;
  error?: string;
}

export const RECONCILE_MAX_ATTEMPTS = 6;
const BASE_BACKOFF_MS = 30_000;        // 30s, doubling
const MAX_BACKOFF_MS = 60 * 60_000;    // cap at 1h

/** Capped exponential backoff for the Nth failed attempt (1-based). */
export function reconcileBackoffMs(attempt: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
}

const key = (r: MirrorRecord) => ({ companyId: r.companyId, entity: r.entity, pk: r.pk });

/**
 * Reconcile a single mirror record. Exactly-once (done short-circuit), idempotent
 * handler, retry/backoff with dead-letter. Shared by the batch loop and the
 * operator console's on-demand retry.
 */
export async function reconcileOne(
  deps: ReconcileDeps,
  handlers: Record<string, ReconcileHandler>,
  rec: MirrorRecord,
  now: number = Date.now(),
): Promise<ReconcileOutcome> {
  const state = await deps.getState(rec);
  if (state?.status === 'done') return { ...key(rec), status: 'done', alreadyDone: true };

  const handler = handlers[rec.entity];
  if (!handler) {
    // No materializer for this entity yet — park it visibly, don't fake done.
    await deps.markSkipped(rec, 'no-handler');
    return { ...key(rec), status: 'skipped', reason: 'no-handler' };
  }

  const attempts = (state?.attempts ?? 0) + 1;
  try {
    const { businessId } = await handler.materialize(rec);
    await deps.markDone(rec, businessId, attempts);
    return { ...key(rec), status: 'done', businessId };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    const deadLetter = attempts >= RECONCILE_MAX_ATTEMPTS;
    const nextAttemptAt = deadLetter ? Number.MAX_SAFE_INTEGER : now + reconcileBackoffMs(attempts);
    await deps.markFailed(rec, attempts, error, nextAttemptAt, deadLetter);
    return { ...key(rec), status: 'failed', deadLetter, error };
  }
}

/**
 * Process a due batch. Each record is independent: a failure on one is recorded
 * (retriable) and never blocks the rest, and never partially duplicates.
 */
export async function reconcile(
  deps: ReconcileDeps,
  handlers: Record<string, ReconcileHandler>,
  opts: { limit?: number; now?: number } = {},
): Promise<ReconcileOutcome[]> {
  const now = opts.now ?? Date.now();
  const batch = await deps.due(opts.limit ?? 100);
  const outcomes: ReconcileOutcome[] = [];
  for (const rec of batch) outcomes.push(await reconcileOne(deps, handlers, rec, now));
  return outcomes;
}
