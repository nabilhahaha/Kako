// ============================================================================
// Event → Workflow dispatcher (Constitution Art. 32/43, P0-01 Phase 2).
//
//   erp_events  →  dispatchEvent()  →  workflow run (existing engine)
//
// Matches a domain event to active workflow definitions (trigger_event +
// trigger_config) and starts a run for each via the EXISTING engine RPC
// (erp_workflow_start) — it reuses the single engine, never reimplements it.
// SLA timers + escalation then flow from the existing engine (sla_hours /
// erp_workflow_tick); the future Workflow Builder writes the definitions this
// reads. Pure orchestration over an injected `DispatchDeps`, so it is fully
// unit-testable without a database.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DomainEvent, WorkflowDefinition } from './types';
import { selectTriggeredDefinitions } from './trigger-match';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

export interface DispatchResult {
  workflowKey: string;
  instanceId: string | null;
  skipped?: string;   // reason a run was not created (no record id, already active, error)
}

export interface DispatchDeps {
  /** Active definitions whose trigger_event matches the event (company + globals). */
  candidates(event: DomainEvent): Promise<WorkflowDefinition[]>;
  /** Start a run via the existing engine; returns the instance id or an error. */
  start(def: WorkflowDefinition, event: DomainEvent): Promise<{ instanceId: string | null; error?: string }>;
  /** Link the started run back to its triggering event (provenance) — best effort. */
  link(instanceId: string, event: DomainEvent): Promise<void>;
}

/**
 * Dispatch one event. Idempotency + "one active workflow per record" are enforced
 * by the engine (uq_wf_instance_active): a duplicate start surfaces as an error and
 * is recorded as `skipped`, never throwing. Returns one result per matched workflow.
 */
export async function dispatchEvent(deps: DispatchDeps, event: DomainEvent): Promise<DispatchResult[]> {
  // A record-scoped workflow needs a record id; entity-less events are bus-only.
  if (!event.recordId) return [];

  const defs = selectTriggeredDefinitions(await deps.candidates(event), event);
  const out: DispatchResult[] = [];
  for (const def of defs) {
    const { instanceId, error } = await deps.start(def, event);
    if (!instanceId) { out.push({ workflowKey: def.key, instanceId: null, skipped: error ?? 'not-started' }); continue; }
    try { await deps.link(instanceId, event); } catch { /* provenance link is best-effort */ }
    out.push({ workflowKey: def.key, instanceId });
  }
  return out;
}

/** Supabase-backed deps. `candidates` reuses the repository query; `start` calls the
 *  existing engine RPC; `link` sets the additive 0176 provenance columns. */
export function makeDispatchDeps(db: Db): DispatchDeps {
  return {
    async candidates(event) {
      const { listDefinitionsForEvent } = await import('./repository');
      return listDefinitionsForEvent(db, event.companyId, event.eventType);
    },
    async start(def, event) {
      const { data, error } = await db.rpc('erp_workflow_start', {
        p_key: def.key, p_entity: def.entity, p_record_id: event.recordId,
        p_context: { event_id: event.id, event_type: event.eventType, ...event.payload },
      });
      if (error) return { instanceId: null, error: error.message };
      return { instanceId: (data as string) ?? null };
    },
    async link(instanceId, event) {
      await db.from('erp_workflow_instances' as never)
        .update({ trigger_event_id: event.id, branch_id: event.branchId } as never)
        .eq('id', instanceId);
    },
  };
}
