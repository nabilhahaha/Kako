// ============================================================================
// Runtime service — loads a run + its steps from the DB, builds the adapter, and
// drives the pure runtime (Constitution Art. 32). Entry points for the tick
// driver and for resume-after-approval. One engine, one runtime.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RunState, RuntimeStep } from './executors/types';
import type { WorkflowStepType } from './types';
import { advanceRun, type RunOutcome } from './runtime';
import { makeRuntimeDeps } from './runtime-deps';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

const INSTANCE_COLS =
  'id,company_id,branch_id,definition_id,entity,record_id,current_step_id,context,attempts,started_by,runtime_state';
const STEP_COLS =
  'id,step_no,step_type,name,config,approver_type,approver_ref,sla_hours,escalate_to,condition,next_on_success,next_on_failure';

function toStep(r: Record<string, unknown>): RuntimeStep {
  return {
    id: String(r.id), stepNo: Number(r.step_no), stepType: String(r.step_type) as WorkflowStepType,
    name: (r.name as string) ?? null, config: (r.config as Record<string, unknown>) ?? {},
    approverType: (r.approver_type as string) ?? null, approverRef: (r.approver_ref as string) ?? null,
    slaHours: (r.sla_hours as number) ?? null, escalateTo: (r.escalate_to as string) ?? null,
    condition: (r.condition as Record<string, unknown>) ?? null,
    nextOnSuccess: (r.next_on_success as string) ?? null, nextOnFailure: (r.next_on_failure as string) ?? null,
  };
}

export interface LoadedRun { run: RunState; steps: RuntimeStep[] }

/** Load a workflow run + its definition's steps. */
export async function loadRun(db: Db, instanceId: string): Promise<LoadedRun | null> {
  const { data: inst } = await db.from('erp_workflow_instances' as never).select(INSTANCE_COLS).eq('id', instanceId).maybeSingle();
  if (!inst) return null;
  const i = inst as Record<string, unknown>;
  const { data: stepRows } = await db.from('erp_workflow_steps' as never)
    .select(STEP_COLS).eq('definition_id', i.definition_id).order('step_no', { ascending: true });
  const steps = ((stepRows ?? []) as Record<string, unknown>[]).map(toStep);
  const run: RunState = {
    id: String(i.id), companyId: String(i.company_id), branchId: (i.branch_id as string) ?? null,
    definitionId: String(i.definition_id), entity: String(i.entity), recordId: String(i.record_id),
    currentStepId: (i.current_step_id as string) ?? null,
    context: (i.context as Record<string, unknown>) ?? {}, attempts: Number(i.attempts ?? 0),
    actorId: (i.started_by as string) ?? null,
  };
  return { run, steps };
}

/** Load + advance a run to its next pause/terminal state. Returns null if missing. */
export async function advanceInstance(db: Db, instanceId: string): Promise<RunOutcome | null> {
  const loaded = await loadRun(db, instanceId);
  if (!loaded) return null;
  const stepNoById = new Map(loaded.steps.map((s) => [s.id, s.stepNo]));
  const deps = makeRuntimeDeps(db, { companyId: loaded.run.companyId, actorId: loaded.run.actorId, stepNoById });
  return advanceRun(deps, loaded.run, loaded.steps);
}

/** Resume entry (after an approval decision, or operator retry). Same as advance. */
export const resumeRun = advanceInstance;

/** Runs due for the tick: waiting/retrying with a wake time in the past. Approval
 *  pauses have next_action_at = NULL and are resumed via resumeRun(), not here. */
export async function listDueRuns(db: Db, limit = 100): Promise<{ id: string; startedBy: string | null }[]> {
  const { data } = await db.from('erp_workflow_instances' as never)
    .select('id,started_by,runtime_state,next_action_at')
    .eq('runtime_state', 'waiting').not('next_action_at', 'is', null).lte('next_action_at', new Date().toISOString())
    .order('next_action_at', { ascending: true }).limit(limit);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ id: String(r.id), startedBy: (r.started_by as string) ?? null }));
}
