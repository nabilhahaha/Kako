/** ── Customer Onboarding — import rollback eligibility (pure, no I/O) ───────
 *
 *  Onboarding is iterative: import, inspect, fix, re-import. A rollback removes
 *  every row written by one import job (matched by the `import_job_id` stamp) so
 *  a mistaken load can be undone before go-live. This module decides, purely,
 *  WHICH jobs can be rolled back and reports why.
 *
 *  A job is reversible only when its target table records `import_job_id`
 *  (see `entityStamps`). Transactional child tables (invoice lines, payments,
 *  stock, …) don't carry that stamp, so their imports are flagged non-reversible
 *  with a clear reason rather than risking an unscoped delete.
 */

import { getEntity, entityStamps } from './entities';

export type RollbackReason = 'ok' | 'notCompleted' | 'noAudit' | 'unknownEntity' | 'alreadyRolledBack';

export interface RollbackJobLike {
  id: string;
  target_entity: string | null;
  file_name: string | null;
  status: string | null;
  total_rows: number | null;
  success_rows: number | null;
  created_at: string | null;
  /** erp_import_jobs.error_log (jsonb array); may carry a rollback marker. */
  error_log?: unknown;
}

export interface RollbackRow {
  id: string;
  entityKey: string;
  fileName: string;
  successRows: number;
  totalRows: number;
  createdAt: string | null;
  eligible: boolean;
  reason: RollbackReason;
  rolledBack: boolean;
}

/** Marker object appended to a job's error_log when it is rolled back. */
export interface RollbackMarker { __rollback: { at: string; deleted: number } }

export function isRollbackMarker(x: unknown): x is RollbackMarker {
  return !!x && typeof x === 'object' && '__rollback' in (x as Record<string, unknown>);
}

/** Whether a completed job for this entity carries a rollback marker already. */
export function hasRollbackMarker(errorLog: unknown): boolean {
  return Array.isArray(errorLog) && errorLog.some(isRollbackMarker);
}

/** Can an entity's imports be rolled back? Only if its table stamps import_job_id. */
export function rollbackEligibility(entityKey: string | null): { eligible: boolean; reason: RollbackReason } {
  if (!entityKey) return { eligible: false, reason: 'unknownEntity' };
  const entity = getEntity(entityKey);
  if (!entity) return { eligible: false, reason: 'unknownEntity' };
  if (!entityStamps(entity).importJobId) return { eligible: false, reason: 'noAudit' };
  return { eligible: true, reason: 'ok' };
}

function completedStatus(status: string | null): boolean {
  const s = (status ?? '').toLowerCase();
  return s === 'completed' || s === 'success' || s === 'done';
}

/** Build the rollback view rows from import jobs. */
export function buildRollbackList(jobs: readonly RollbackJobLike[]): RollbackRow[] {
  return jobs.map((j) => {
    const elig = rollbackEligibility(j.target_entity);
    const rolledBack = hasRollbackMarker(j.error_log);
    let eligible = elig.eligible;
    let reason = elig.reason;
    if (eligible && rolledBack) { eligible = false; reason = 'alreadyRolledBack'; }
    else if (eligible && !completedStatus(j.status)) { eligible = false; reason = 'notCompleted'; }
    else if (eligible && (j.success_rows ?? 0) <= 0) { eligible = false; reason = 'notCompleted'; }
    return {
      id: j.id,
      entityKey: j.target_entity ?? '',
      fileName: j.file_name ?? '—',
      successRows: Math.max(0, j.success_rows ?? 0),
      totalRows: Math.max(0, j.total_rows ?? 0),
      createdAt: j.created_at,
      eligible,
      reason,
      rolledBack,
    };
  });
}
