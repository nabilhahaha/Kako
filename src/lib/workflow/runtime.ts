// ============================================================================
// Workflow Runtime (Constitution Art. 32). The single driver of a run:
//
//   run → current step → executor → result → next step → … → terminal
//
// Auto-chains automated steps; pauses on approval (handed to the existing engine
// task/decide) and on delay/SLA (resumed by the tick). Retries retryable
// failures with capped backoff, then dead-letters to 'failed'. Pure orchestration
// over an injected `RuntimeDeps`, fully unit-testable. Reuses the one engine; it
// does not reimplement approval logic.
// ============================================================================

import { getExecutor } from './executors/registry';
import type { ExecutorDeps, RunState, RuntimeStep, StepResult } from './executors/types';

export const MAX_RUN_ATTEMPTS = 6;
const MAX_CHAIN = 50;                 // guard against mis-wired infinite step graphs
const BASE_BACKOFF_MS = 30_000;       // 30s · 2^attempt, capped
const MAX_BACKOFF_MS = 60 * 60_000;

export type RunOutcomeState =
  | 'completed' | 'rejected' | 'failed'            // terminal
  | 'awaiting_approval' | 'waiting' | 'retry_scheduled'; // paused

export interface RunOutcome { state: RunOutcomeState; run: RunState; executed: string[] }

/** DB persistence patch (mapped to erp_workflow_instances by the supabase deps). */
export interface RunPatch {
  status?: 'running' | 'waiting' | 'completed' | 'rejected' | 'failed';
  currentStepId?: string | null;
  nextActionAt?: number | null;
  attempts?: number;
  context?: Record<string, unknown>;
  lastError?: string | null;
  completedAt?: number | null;
}

export interface RuntimeDeps {
  exec: ExecutorDeps;
  /** Persist a patch and return the updated run state. */
  persist(run: RunState, patch: RunPatch): Promise<RunState>;
}

function backoff(attempt: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
}

function currentStep(run: RunState, ordered: RuntimeStep[], byId: Map<string, RuntimeStep>): RuntimeStep | undefined {
  return run.currentStepId ? byId.get(run.currentStepId) : ordered[0];
}

function nextStep(step: RuntimeStep, ordered: RuntimeStep[], byId: Map<string, RuntimeStep>, branch?: 'success' | 'failure'): RuntimeStep | undefined {
  if (branch === 'failure' && step.nextOnFailure) return byId.get(step.nextOnFailure);
  if (step.nextOnSuccess) return byId.get(step.nextOnSuccess);
  return ordered.find((s) => s.stepNo > step.stepNo);   // default: sequential
}

/**
 * Advance a run from its current step until it pauses (approval/wait/retry) or
 * reaches a terminal state. `steps` is the run definition's full step list.
 */
export async function advanceRun(deps: RuntimeDeps, runIn: RunState, steps: RuntimeStep[]): Promise<RunOutcome> {
  let run = runIn;
  const executed: string[] = [];
  const ordered = [...steps].sort((a, b) => a.stepNo - b.stepNo);
  const byId = new Map(ordered.map((s) => [s.id, s]));

  for (let i = 0; i < MAX_CHAIN; i++) {
    const step = currentStep(run, ordered, byId);
    if (!step) {
      run = await deps.persist(run, { status: 'completed', currentStepId: null, completedAt: deps.exec.now() });
      return { state: 'completed', run, executed };
    }

    const executor = getExecutor(step.stepType);
    if (!executor) {
      run = await deps.persist(run, { status: 'failed', lastError: `no executor for step_type '${step.stepType}'` });
      return { state: 'failed', run, executed };
    }

    const errs = executor.validate(step);
    if (errs.length) {
      const result: StepResult = { status: 'failed', error: errs.join('; ') };
      run = await recordStep(deps, run, step, result);
      run = await deps.persist(run, { status: 'failed', lastError: result.error, context: run.context });
      return { state: 'failed', run, executed };
    }

    let result: StepResult;
    try {
      result = await executor.execute({ run, step, deps: deps.exec });
    } catch (e) {
      result = { status: 'failed', error: e instanceof Error ? e.message : String(e), retryable: true };
    }
    executed.push(step.id);
    run = await recordStep(deps, run, step, result);   // audit + history + output merge

    if (result.status === 'paused') {
      run = await deps.persist(run, { status: 'waiting', currentStepId: step.id, context: run.context });
      return { state: 'awaiting_approval', run, executed };
    }
    if (result.status === 'waiting') {
      run = await deps.persist(run, { status: 'waiting', currentStepId: step.id, nextActionAt: result.waitUntil ?? null, context: run.context });
      return { state: 'waiting', run, executed };
    }
    if (result.status === 'failed') {
      if (result.retryable && run.attempts < MAX_RUN_ATTEMPTS) {
        const nextAt = deps.exec.now() + backoff(run.attempts);
        run = await deps.persist(run, { status: 'waiting', currentStepId: step.id, attempts: run.attempts + 1, nextActionAt: nextAt, lastError: result.error, context: run.context });
        return { state: 'retry_scheduled', run, executed };
      }
      run = await deps.persist(run, { status: 'failed', lastError: result.error ?? 'step failed', context: run.context });
      return { state: 'failed', run, executed };
    }

    // completed
    if (step.stepType === 'reject') {
      run = await deps.persist(run, { status: 'rejected', currentStepId: step.id, completedAt: deps.exec.now(), context: run.context });
      return { state: 'rejected', run, executed };
    }
    const next = nextStep(step, ordered, byId, result.branch);
    if (!next) {
      run = await deps.persist(run, { status: 'completed', currentStepId: null, completedAt: deps.exec.now(), context: run.context });
      return { state: 'completed', run, executed };
    }
    run = await deps.persist(run, { status: 'running', currentStepId: next.id, attempts: 0, context: run.context });
    // continue chaining; the next iteration executes `next`
  }

  run = await deps.persist(run, { status: 'failed', lastError: 'workflow chain exceeded MAX_CHAIN (possible cycle)' });
  return { state: 'failed', run, executed };
}

/** Merge step output + append step history into context, then emit the audit entry. */
async function recordStep(deps: RuntimeDeps, run: RunState, step: RuntimeStep, result: StepResult): Promise<RunState> {
  const history = Array.isArray(run.context.__steps) ? (run.context.__steps as unknown[]) : [];
  const entry = { step_id: step.id, step_no: step.stepNo, type: step.stepType, status: result.status, at: deps.exec.now(), error: result.error ?? null };
  const next: RunState = { ...run, context: { ...run.context, ...(result.output ?? {}), __steps: [...history, entry] } };
  try { await deps.exec.audit({ run: next, step, result }); } catch { /* audit is best-effort */ }
  return next;
}
