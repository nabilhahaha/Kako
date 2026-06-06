// ============================================================================
// Supabase-backed reconciliation deps + handler registry.
//
// Wires the pure reconcile() engine to the cloud mirror + ledger from
// docs/architecture/sync/proposed-migrations/0002_sync_reconcile.sql via the
// service-role client. Behind KAKO_SYNC; the tables don't exist in production.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReconcileDeps, MirrorRecord, ReconcileHandler } from './reconcile';
import { cashierCheckoutCore } from '@/lib/erp/sales/cashier-core';
import { wholesaleInvoiceCore, type CoreCtx, type Translate } from '@/lib/erp/sales/invoice-core';
import type { LineInput } from '@/lib/erp/sales-calc';
import type { PaymentMethod } from '@/lib/erp/types';
import { createUserScopedClient } from './impersonate';

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

// Orders (POS cash sale + wholesale invoice) → real erp_invoices via the SAME
// audited cores the online path uses (numbering / stock-out / AR / payment all in
// their DB RPCs). Idempotent on the mirror pk (createInvoiceCore dedupes on
// idempotency_key; erp_record_payment dedupes on its key) and resumable after a
// partial failure. Online-created sales are mirrored too (pk = real invoice id,
// no `offline` flag) — those are already real, so we confirm and mark done.
function ordersHandler(db: Db): ReconcileHandler {
  const t: Translate = (k) => k; // worker context: surface the message key for last_error
  return {
    async materialize(rec: MirrorRecord) {
      const p = rec.data as Record<string, unknown>;

      if (p.offline !== true) {
        const { data: inv } = await db.from('erp_invoices' as never).select('id').eq('id', rec.pk).maybeSingle();
        return { businessId: (inv as { id: string } | null)?.id ?? rec.pk };
      }

      const ctx: CoreCtx = { userId: String(p.created_by ?? ''), companyId: rec.companyId };
      if (!ctx.userId) throw new Error('reconcile(orders): missing created_by on offline order');
      const branch_id = String(p.branch_id ?? '');
      const payment_method = (p.payment_method ?? 'cash') as PaymentMethod;
      const lines: LineInput[] = ((p.lines as Record<string, unknown>[]) ?? []).map((l) => ({
        product_id: String(l.product_id), quantity: Number(l.quantity), unit_price: Number(l.unit_price), discount_pct: 0, tax_rate: 0,
      }));

      // Run the audited cores AS the originating cashier (auth.uid()=created_by):
      // same branch authority, RLS, and audit attribution as the online sale.
      const userDb = createUserScopedClient(ctx.userId);

      if (p.customer_id) {
        const res = await wholesaleInvoiceCore(userDb, ctx, t,
          { branch_id, customer_id: String(p.customer_id), lines, collect: !!p.collect, payment_method },
          { idempotencyKey: rec.pk });
        if (!res.ok || !res.data) throw new Error(res.error ?? 'wholesale reconcile failed');
        return { businessId: res.data.invoice_id };
      }
      const res = await cashierCheckoutCore(userDb, ctx, t, { branch_id, lines, payment_method }, { idempotencyKey: rec.pk });
      if (!res.ok || !res.data) throw new Error(res.error ?? 'pos reconcile failed');
      return { businessId: res.data.invoice_id };
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
    // Orders → invoices via the audited cores (branch-validated end-to-end).
    orders: ordersHandler(db),
    // visits / survey_response handlers are added the same way once their column
    // maps are validated against erp_clinic_visits / erp_survey_responses.
  };
}

/** Entities the worker attempts to reconcile (hybrid-policy offline-queue set). */
export const RECONCILABLE_ENTITIES = ['customers', 'orders'];

// ── Operator-console reads/actions (tenant-scoped) ───────────────────────────

export interface ReconcileLedgerRow {
  entity: string; pk: string; status: string; business_id: string | null;
  attempts: number; last_error: string | null; reason: string | null;
  next_attempt_at: string; updated_at: string;
}
export interface ReconcileOverview {
  counts: Record<string, number>;
  attention: ReconcileLedgerRow[];   // failed / skipped, newest first
  recentLog: { entity: string; pk: string; status: string; error: string | null; at: string }[];
}

/** Status counts + the records needing attention + a recent audit tail, for one company. */
export async function fetchReconcileOverview(db: Db, companyId: string): Promise<ReconcileOverview> {
  const { data: rows } = await db.from('sync_reconcile' as never)
    .select('entity,pk,status,business_id,attempts,last_error,reason,next_attempt_at,updated_at')
    .eq('company_id', companyId);
  const ledger = (rows ?? []) as unknown as ReconcileLedgerRow[];
  const counts: Record<string, number> = {};
  for (const r of ledger) counts[r.status] = (counts[r.status] ?? 0) + 1;
  const attention = ledger
    .filter((r) => r.status === 'failed' || r.status === 'skipped')
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
    .slice(0, 100);
  const { data: log } = await db.from('sync_reconcile_log' as never)
    .select('entity,pk,status,error,at').eq('company_id', companyId)
    .order('at', { ascending: false }).limit(50);
  return { counts, attention, recentLog: (log ?? []) as ReconcileOverview['recentLog'] };
}

/** Load one mirror record (the materialization source) for an on-demand retry. */
export async function loadMirrorRecord(db: Db, companyId: string, entity: string, pk: string): Promise<MirrorRecord | null> {
  const { data } = await db.from('sync_rows' as never)
    .select('company_id,entity,pk,data,deleted')
    .eq('company_id', companyId).eq('entity', entity).eq('pk', pk).maybeSingle();
  if (!data) return null;
  const r = data as { company_id: string; entity: string; pk: string; data: Record<string, unknown> | null; deleted: boolean };
  return { companyId: r.company_id, entity: r.entity, pk: r.pk, data: r.data ?? {}, deleted: !!r.deleted };
}

/** Clear the backoff/attempt counter so an operator retry gets a fresh cycle. */
export async function resetForRetry(db: Db, companyId: string, entity: string, pk: string): Promise<void> {
  await db.from('sync_reconcile' as never)
    .update({ attempts: 0, status: 'pending', next_attempt_at: new Date().toISOString(), reason: 'manual-retry' } as never)
    .eq('company_id', companyId).eq('entity', entity).eq('pk', pk);
}
