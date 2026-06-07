// ============================================================================
// Builder simulation (Constitution Art. 32, Requirement 3). Dry-runs a draft
// against REAL context using the EXACT runtime (advanceRun) with a read-only /
// mock ExecutorDeps — NO instance/run, NO side effects, NO events. Reuses the
// runtime; zero parallel simulator logic.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { advanceRun, type RuntimeDeps } from '../runtime';
import type { ExecutorDeps, RunState, RuntimeStep } from '../executors/types';
import type { WorkflowStepType } from '../types';
import { evalCondition } from '../condition-eval';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any>;

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

export interface SimulationInput {
  definitionId: string;
  entity: string;
  recordId: string;
  /** Real context (e.g. the subject record's fields) for condition evaluation. */
  context?: Record<string, unknown>;
  /** Simulated approval decisions keyed by step_no (for previewing branches). */
  approvals?: Record<number, 'approved' | 'rejected'>;
}

export interface SimulationStep {
  step_no: number; type: string; status: string; branch?: string; error: string | null; would?: string;
}
export interface SimulationResult {
  state: string; executed: string[]; trace: SimulationStep[]; context: Record<string, unknown>;
}

/** Run a side-effect-free simulation of the draft's steps. */
export async function simulateWorkflow(db: Db, companyId: string, actorId: string | null, input: SimulationInput): Promise<SimulationResult> {
  const { data: stepRows } = await db.from('erp_workflow_steps' as never)
    .select(STEP_COLS).eq('definition_id', input.definitionId).order('step_no', { ascending: true });
  const steps = ((stepRows ?? []) as Record<string, unknown>[]).map(toStep);

  const trace: SimulationStep[] = [];
  const noted: Record<number, string> = {};

  const exec: ExecutorDeps = {
    now: () => Date.now(),
    ensureApprovalTask: async () => { /* no task created in simulation */ },
    approvalDecision: async (_run, step) => input.approvals?.[step.stepNo] ?? null, // undecided → pause
    notify: async (i) => { noted[stepNoFromConfig(i)] = `would notify ${i.channel}/${i.template}`; },
    createTask: async () => ({ taskId: 'sim' }),
    updateRecord: async (i) => { void i; },
    httpCall: async () => ({ status: 200, body: { simulated: true } }), // never really calls out
    escalate: async () => { /* would escalate */ },
    evalCondition: (c, v) => evalCondition(c, v),
    audit: async ({ step, result }) => {
      trace.push({ step_no: step.stepNo, type: step.stepType, status: result.status, branch: result.branch, error: result.error ?? null, would: noted[step.stepNo] });
    },
  };
  // In-memory persist — never touches erp_workflow_instances.
  const deps: RuntimeDeps = {
    exec,
    persist: async (run, patch) => ({
      ...run,
      currentStepId: patch.currentStepId !== undefined ? patch.currentStepId : run.currentStepId,
      attempts: patch.attempts ?? run.attempts,
      context: patch.context ?? run.context,
    }),
  };

  const run: RunState = {
    id: 'sim', companyId, branchId: null, definitionId: input.definitionId, entity: input.entity,
    recordId: input.recordId, currentStepId: null, context: input.context ?? {}, attempts: 0, actorId,
  };
  const outcome = await advanceRun(deps, run, steps);
  return { state: outcome.state, executed: outcome.executed, trace, context: outcome.run.context };
}

function stepNoFromConfig(_i: unknown): number { return -1; } // notes are best-effort; keyed loosely
