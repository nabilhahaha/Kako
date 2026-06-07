// ============================================================================
// Event Bus service (Constitution Art. 43). Emits domain events onto the shared
// erp_events log. Foundational only — this is NOT yet called from any existing
// business action (no business logic is modified by P0-01). Future emitters and
// the workflow runtime will consume this.
//
// Takes an injected Supabase client (like the sync deps) so it works from server
// actions (session/RLS), the service-role worker, or tests.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DomainEvent, EventSource } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

export interface EmitEventInput {
  companyId: string;
  eventType: string;
  entity: string;
  recordId?: string | null;
  branchId?: string | null;
  payload?: Record<string, unknown>;
  actorId?: string | null;
  source?: EventSource;
  /** Optional emitter idempotency — a repeat with the same key is a no-op. */
  dedupeKey?: string | null;
}

/**
 * Append a domain event. Returns the new id, or `{ deduped: true }` when an event
 * with the same (company_id, dedupe_key) already exists (race-safe via the
 * uq_erp_events_dedupe partial unique index).
 */
export async function emitEvent(db: Db, input: EmitEventInput): Promise<{ id: string | null; deduped: boolean }> {
  const row = {
    company_id: input.companyId,
    branch_id: input.branchId ?? null,
    event_type: input.eventType,
    entity: input.entity,
    record_id: input.recordId ?? null,
    payload: input.payload ?? {},
    actor_id: input.actorId ?? null,
    source: input.source ?? 'app',
    dedupe_key: input.dedupeKey ?? null,
  };
  const { data, error } = await db.from('erp_events' as never).insert(row as never).select('id').maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === '23505' && input.dedupeKey) return { id: null, deduped: true };
    throw new Error(error.message);
  }
  return { id: (data as { id: string } | null)?.id ?? null, deduped: false };
}

/** Read the company event feed after a cursor (for future consumers/projections). */
export async function readEventFeed(db: Db, companyId: string, sinceSeq = 0, limit = 200): Promise<DomainEvent[]> {
  const { data } = await db.from('erp_events' as never)
    .select('id,company_id,branch_id,event_type,entity,record_id,payload,actor_id,source,occurred_at,seq')
    .eq('company_id', companyId).gt('seq', sinceSeq)
    .order('seq', { ascending: true }).limit(limit);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), companyId: String(r.company_id), branchId: (r.branch_id as string) ?? null,
    eventType: String(r.event_type), entity: String(r.entity), recordId: (r.record_id as string) ?? null,
    payload: (r.payload as Record<string, unknown>) ?? {}, actorId: (r.actor_id as string) ?? null,
    source: r.source as EventSource, occurredAt: String(r.occurred_at),
  }));
}
