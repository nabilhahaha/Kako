// ============================================================================
// Supabase-backed reconciliation deps + handler registry.
//
// Wires the pure reconcile() engine to the cloud mirror + ledger from
// docs/architecture/sync/proposed-migrations/0002_sync_reconcile.sql via the
// service-role client. Behind KAKO_SYNC; the tables don't exist in production.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReconcileDeps, MirrorRecord, ReconcileHandler } from './reconcile';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

// A dead-lettered record parks ~100 years out so the due-query never re-claims it.
const FAR_FUTURE = () => new Date(Date.now() + 100 * 365 * 24 * 3600_000).toISOString();

async function mark(
  db: Db, rec: MirrorRecord, status: string,
  businessId: string | null, attempts: number, error: string | null,
  reason: string | null, nextAttemptAt: string,
): Promise<void> {
  const { error: e } = await db.rpc('sync_reconcile_mark', {
    p_company_id: rec.companyId, p_entity: rec.entity, p_pk: rec.pk, p_status: status,
    p_business_id: businessId, p_attempts: attempts, p_error: error, p_reason: reason,
    p_next_attempt_at: nextAttemptAt,
  });
  if (e) throw new Error(e.message);
}

export function makeReconcileDeps(db: Db, entities: string[]): ReconcileDeps {
  return {
    async due(limit) {
      const { data, error } = await db.rpc('sync_reconcile_due', { p_entities: entities, p_limit: limit });
      if (error) throw new Error(error.message);
      return ((data ?? []) as { company_id: string; entity: string; pk: string; data: Record<string, unknown> | null; deleted: boolean }[])
        .map((r) => ({ companyId: r.company_id, entity: r.entity, pk: r.pk, data: r.data ?? {}, deleted: !!r.deleted }));
    },
    async getState(rec) {
      const { data } = await db.from('sync_reconcile' as never).select('status,attempts')
        .eq('company_id', rec.companyId).eq('entity', rec.entity).eq('pk', rec.pk).maybeSingle();
      if (!data) return null;
      const row = data as { status: 'pending' | 'done' | 'failed' | 'skipped'; attempts: number };
      return { status: row.status, attempts: row.attempts };
    },
    async markDone(rec, businessId, attempts) {
      await mark(db, rec, 'done', businessId, attempts, null, null, new Date().toISOString());
    },
    async markFailed(rec, attempts, error, nextAttemptAt, deadLetter) {
      const next = deadLetter ? FAR_FUTURE() : new Date(nextAttemptAt).toISOString();
      await mark(db, rec, 'failed', null, attempts, error, deadLetter ? 'dead-letter' : null, next);
    },
    async markSkipped(rec, reason) {
      await mark(db, rec, 'skipped', null, 0, null, reason, FAR_FUTURE());
    },
  };
}

// ── Handler registry ────────────────────────────────────────────────────────
//
// Single-table operational entities materialize idempotently using the offline
// client uuid AS the business row id (ON CONFLICT (id) DO NOTHING), so a re-run —
// or a crash between materialize and markDone — can never double-create. Only the
// hybrid-policy "offline-queue" operational entities have handlers; financial /
// stock-affecting flows are require-online and never reach the mirror.

interface SingleTableSpec {
  table: string;
  /** Column → mirror-payload key (or a literal via fn). Numeric/bool coerced by PG. */
  columns: Record<string, string>;
}

function singleTableHandler(db: Db, spec: SingleTableSpec): ReconcileHandler {
  return {
    async materialize(rec: MirrorRecord) {
      const row: Record<string, unknown> = { id: rec.pk, company_id: rec.companyId };
      for (const [col, srcKey] of Object.entries(spec.columns)) {
        const v = rec.data[srcKey];
        if (v !== undefined && v !== '') row[col] = v;
      }
      // Idempotent insert: the offline uuid is the business id, so a replay no-ops.
      const { data, error } = await db.from(spec.table as never)
        .upsert(row as never, { onConflict: 'id', ignoreDuplicates: true })
        .select('id');
      if (error) throw new Error(error.message);
      const id = (data as { id: string }[] | null)?.[0]?.id ?? rec.pk;
      return { businessId: id };
    },
  };
}

/**
 * Build the entity→handler registry. Column maps are intentionally a conservative
 * allow-list of stable business columns (validated against the live schema); extra
 * fields a richer offline form captured are filled in by the normal online
 * field-merge on the record's next edit.
 */
export function makeReconcileHandlers(db: Db): Record<string, ReconcileHandler> {
  return {
    customers: singleTableHandler(db, {
      table: 'erp_customers',
      columns: {
        code: 'code', name: 'name', name_ar: 'name_ar', phone: 'phone', email: 'email',
        address: 'address', branch_id: 'branch_id', salesman_id: 'salesman_id',
        tax_number: 'tax_number', credit_limit: 'credit_limit',
      },
    }),
    // visits / survey_response handlers are added the same way once their column
    // maps are validated against erp_clinic_visits / erp_survey_responses.
  };
}

/** Entities the worker attempts to reconcile (hybrid-policy offline-queue set). */
export const RECONCILABLE_ENTITIES = ['customers'];
