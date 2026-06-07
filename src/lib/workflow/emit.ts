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
import { emitEvent } from './events';
import { dispatchEvent, makeDispatchDeps } from './dispatcher';
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

    const { id } = await emitEvent(db, {
      companyId: ctx.companyId, actorId: ctx.userId, source: 'app',
      eventType: input.eventType, entity: input.entity,
      recordId: input.recordId ?? null, branchId: input.branchId ?? null,
      payload: input.payload ?? {}, dedupeKey: input.dedupeKey ?? null,
    });
    if (!id) return;                                   // deduped or not persisted

    const event: DomainEvent = {
      id, companyId: ctx.companyId, branchId: input.branchId ?? null,
      eventType: input.eventType, entity: input.entity, recordId: input.recordId ?? null,
      payload: input.payload ?? {}, actorId: ctx.userId, source: 'app',
      occurredAt: new Date().toISOString(),
    };
    await dispatchEvent(makeDispatchDeps(db), event);
  } catch (e) {
    // Producers are non-fatal by constitution — log and continue.
    console.error('[workflow] recordEvent failed (non-fatal):', e);
  }
}
