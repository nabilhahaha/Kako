// ============================================================================
// Workflow repository (Constitution Art. 32). Read/query layer over the SINGLE
// existing engine (erp_workflow_definitions/_steps/_instances/_tasks) plus thin
// wrappers around the existing engine RPCs (erp_workflow_start / _decide) — it
// REUSES them, it does not reimplement workflow logic. Foundational scaffolding
// for the future Workflow Builder + event-driven runtime; nothing here is yet
// wired into existing business actions.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DomainEvent, WorkflowDefinition } from './types';
import { selectTriggeredDefinitions } from './trigger-match';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

function toDefinition(r: Record<string, unknown>): WorkflowDefinition {
  return {
    id: String(r.id), companyId: (r.company_id as string) ?? null, branchId: (r.branch_id as string) ?? null,
    key: String(r.key), entity: String(r.entity),
    nameEn: (r.name_en as string) ?? null, nameAr: (r.name_ar as string) ?? null,
    description: (r.description as string) ?? null, trigger: String(r.trigger ?? 'manual'),
    triggerEvent: (r.trigger_event as string) ?? null,
    triggerConfig: (r.trigger_config as Record<string, unknown>) ?? {},
    isActive: r.is_active !== false, version: Number(r.version ?? 1),
  };
}

const DEF_COLS = 'id,company_id,branch_id,key,entity,name_en,name_ar,description,trigger,trigger_event,trigger_config,is_active,version';

/** Active definitions for a company (incl. global templates) — for the builder list. */
export async function listDefinitions(db: Db, companyId: string): Promise<WorkflowDefinition[]> {
  const { data } = await db.from('erp_workflow_definitions' as never).select(DEF_COLS)
    .or(`company_id.eq.${companyId},company_id.is.null`).order('key');
  return ((data ?? []) as Record<string, unknown>[]).map(toDefinition);
}

/** Active definitions whose trigger_event matches — candidates for an event. */
export async function listDefinitionsForEvent(db: Db, companyId: string, eventType: string): Promise<WorkflowDefinition[]> {
  const { data } = await db.from('erp_workflow_definitions' as never).select(DEF_COLS)
    .eq('is_active', true).eq('trigger_event', eventType)
    .or(`company_id.eq.${companyId},company_id.is.null`);
  return ((data ?? []) as Record<string, unknown>[]).map(toDefinition);
}

/**
 * Plan (do NOT execute) which workflows an event would start. The future runtime
 * calls this then `startWorkflow` for each. Pure selection on top of a DB read.
 */
export async function planWorkflowsForEvent(db: Db, event: DomainEvent): Promise<WorkflowDefinition[]> {
  const candidates = await listDefinitionsForEvent(db, event.companyId, event.eventType);
  return selectTriggeredDefinitions(candidates, event);
}

/** Start a workflow via the EXISTING engine RPC (reuse, not reimplementation). */
export async function startWorkflow(
  db: Db, input: { key: string; entity: string; recordId: string; context?: Record<string, unknown> },
): Promise<{ instanceId: string }> {
  const { data, error } = await db.rpc('erp_workflow_start', {
    p_key: input.key, p_entity: input.entity, p_record_id: input.recordId, p_context: input.context ?? {},
  });
  if (error) throw new Error(error.message);
  return { instanceId: data as string };
}

/** Decide a task via the EXISTING engine RPC. Returns the engine outcome. */
export async function decideTask(
  db: Db, input: { taskId: string; decision: 'approve' | 'reject'; comment?: string },
): Promise<{ final: boolean; status: string; entity: string; recordId: string }> {
  const { data, error } = await db.rpc('erp_workflow_decide', {
    p_task_id: input.taskId, p_decision: input.decision, p_comment: input.comment ?? null,
  });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as { final?: boolean; status?: string; entity?: string; record_id?: string };
  return { final: !!r.final, status: String(r.status), entity: String(r.entity), recordId: String(r.record_id) };
}

/** Open instances for the company (operator/builder views). */
export async function listOpenInstances(db: Db, companyId: string, limit = 100) {
  const { data } = await db.from('erp_workflow_instances' as never)
    .select('id,definition_id,entity,record_id,status,current_step,branch_id,trigger_event_id,started_at')
    .eq('company_id', companyId).eq('status', 'pending').order('started_at', { ascending: false }).limit(limit);
  return (data ?? []) as Record<string, unknown>[];
}
