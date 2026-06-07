// ============================================================================
// Domain-event producer helper (P0-01 Phase 2). A single best-effort call that
// server actions invoke AFTER a successful mutation:
//
//   await recordEvent({ eventType: 'invoice.issued', entity: 'invoice', recordId: id, payload: {...} });
//
// It (1) appends the event to the shared bus (erp_events — audit + tenant
// isolation via RLS, actor = current user) and (2) dispatches it to matching
// workflows inline (same authenticated request, so the engine RPC has company
// context). It NEVER throws — event production must not change or break business
// logic. Entirely additive; if anything fails it is logged and swallowed.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { emitEvent, markEventDispatched } from './events';
import { dispatchEvent, makeDispatchDeps } from './dispatcher';
import { WF_DISPATCH_SWEEP } from './flags';
import type { DomainEvent } from './types';

export interface RecordEventInput {
  eventType: string;
  entity: string;
  recordId?: string | null;
  branchId?: string | null;
  payload?: Record<string, unknown>;
  dedupeKey?: string | null;
}

/** Emit a domain event + dispatch it to workflows. Best-effort, never throws. */
export async function recordEvent(input: RecordEventInput): Promise<void> {
  try {
    const ctx = await getUserContext();
    if (!ctx?.companyId) return;                       // no tenant context → skip silently
    const db = await createClient();

    // C1 (flagged): persist as 'pending' so a missed/failed inline dispatch is
    // drained by the tick sweep (at-least-once start). Off → DB default 'done' = V1.
    const sweep = WF_DISPATCH_SWEEP();
    const { id } = await emitEvent(db, {
      companyId: ctx.companyId, actorId: ctx.userId, source: 'app',
      eventType: input.eventType, entity: input.entity,
      recordId: input.recordId ?? null, branchId: input.branchId ?? null,
      payload: input.payload ?? {}, dedupeKey: input.dedupeKey ?? null,
      dispatchStatus: sweep ? 'pending' : undefined,
    });
    if (!id) return;                                   // deduped or not persisted

    const event: DomainEvent = {
      id, companyId: ctx.companyId, branchId: input.branchId ?? null,
      eventType: input.eventType, entity: input.entity, recordId: input.recordId ?? null,
      payload: input.payload ?? {}, actorId: ctx.userId, source: 'app',
      occurredAt: new Date().toISOString(),
    };
    await dispatchEvent(makeDispatchDeps(db), event);
    // Inline success → mark done. If dispatch threw, the row stays 'pending' (the
    // outer catch swallows) and the sweep retries it later. At-least-once.
    if (sweep) await markEventDispatched(db, id);
  } catch (e) {
    // Producers are non-fatal by constitution — log and continue.
    console.error('[workflow] recordEvent failed (non-fatal):', e);
  }
}
