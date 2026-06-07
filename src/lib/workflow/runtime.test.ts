import { describe, it, expect, vi } from 'vitest';
import { advanceRun, type RuntimeDeps } from './runtime';
import type { ExecutorDeps, RunState, RuntimeStep } from './executors/types';

function execDeps(over: Partial<ExecutorDeps> = {}): ExecutorDeps {
  return {
    now: () => 1000,
    ensureApprovalTask: vi.fn(async () => {}),
    approvalDecision: vi.fn(async () => null),
    notify: vi.fn(async () => {}),
    createTask: vi.fn(async () => ({ taskId: 't1' })),
    updateRecord: vi.fn(async () => {}),
    httpCall: vi.fn(async () => ({ status: 200, body: {} })),
    escalate: vi.fn(async () => {}),
    evalCondition: vi.fn(() => true),
    audit: vi.fn(async () => {}),
    ...over,
  };
}

// fake persist: applies the patch to the run and returns it (drives the loop)
function runtimeDeps(exec: ExecutorDeps): RuntimeDeps {
  return {
    exec,
    persist: async (run, patch) => ({
      ...run,
      currentStepId: patch.currentStepId !== undefined ? patch.currentStepId : run.currentStepId,
      attempts: patch.attempts ?? run.attempts,
      context: patch.context ?? run.context,
    }),
  };
}

const run = (): RunState => ({
  id: 'r1', companyId: 'co1', branchId: 'b1', definitionId: 'd1', entity: 'customer',
  recordId: 'cust1', currentStepId: null, context: {}, attempts: 0, actorId: 'u1',
});
const step = (over: Partial<RuntimeStep>): RuntimeStep => ({
  id: 'x', stepNo: 1, stepType: 'notification', name: null, config: {},
  approverType: null, approverRef: null, slaHours: null, escalateTo: null,
  condition: null, nextOnSuccess: null, nextOnFailure: null, ...over,
});

describe('workflow runtime — advanceRun', () => {
  it('auto-chains automated steps to completion', async () => {
    const steps = [
      step({ id: 's1', stepNo: 1, stepType: 'notification', config: { channel: 'email', template: 't' } }),
      step({ id: 's2', stepNo: 2, stepType: 'condition', condition: { x: 1 } }),
    ];
    const d = runtimeDeps(execDeps({ evalCondition: () => true }));
    const out = await advanceRun(d, run(), steps);
    expect(out.state).toBe('completed');
    expect(out.executed).toEqual(['s1', 's2']);
  });

  it('pauses at an approval step (hands off to the engine)', async () => {
    const d = execDeps();
    const steps = [
      step({ id: 's1', stepNo: 1, stepType: 'notification', config: { channel: 'email', template: 't' } }),
      step({ id: 's2', stepNo: 2, stepType: 'approval', approverType: 'company_admin' }),
      step({ id: 's3', stepNo: 3, stepType: 'notification', config: { channel: 'email', template: 't' } }),
    ];
    const out = await advanceRun(runtimeDeps(d), run(), steps);
    expect(out.state).toBe('awaiting_approval');
    expect(out.executed).toEqual(['s1', 's2']);    // stopped at approval, s3 not run
    expect(d.ensureApprovalTask).toHaveBeenCalledOnce();
  });

  it('pauses on a delay step with a scheduled wake time', async () => {
    const steps = [step({ id: 's1', stepNo: 1, stepType: 'delay', config: { delay_hours: 2 } })];
    const out = await advanceRun(runtimeDeps(execDeps()), run(), steps);
    expect(out.state).toBe('waiting');
  });

  it('a retryable failure schedules a retry and increments attempts', async () => {
    const steps = [step({ id: 's1', stepNo: 1, stepType: 'api_call', config: { url: 'https://x' } })];
    const out = await advanceRun(runtimeDeps(execDeps({ httpCall: async () => ({ status: 503, body: {} }) })), run(), steps);
    expect(out.state).toBe('retry_scheduled');
    expect(out.run.attempts).toBe(1);
  });

  it('a permanent failure fails the run', async () => {
    const steps = [step({ id: 's1', stepNo: 1, stepType: 'api_call', config: { url: 'https://x' } })];
    const out = await advanceRun(runtimeDeps(execDeps({ httpCall: async () => ({ status: 400, body: {} }) })), run(), steps);
    expect(out.state).toBe('failed');
  });

  it('a reject step rejects the run', async () => {
    const steps = [step({ id: 's1', stepNo: 1, stepType: 'reject' })];
    const out = await advanceRun(runtimeDeps(execDeps()), run(), steps);
    expect(out.state).toBe('rejected');
  });

  it('condition failure routes to next_on_failure', async () => {
    const steps = [
      step({ id: 's1', stepNo: 1, stepType: 'condition', condition: { x: 1 }, nextOnFailure: 's3' }),
      step({ id: 's2', stepNo: 2, stepType: 'notification', config: { channel: 'e', template: 't' } }),  // success path (skipped)
      step({ id: 's3', stepNo: 3, stepType: 'reject' }),                                                  // failure path
    ];
    const out = await advanceRun(runtimeDeps(execDeps({ evalCondition: () => false })), run(), steps);
    expect(out.executed).toEqual(['s1', 's3']);   // skipped s2 via failure branch
    expect(out.state).toBe('rejected');
  });

  it('records step history + audits each step', async () => {
    const d = execDeps();
    const steps = [step({ id: 's1', stepNo: 1, stepType: 'notification', config: { channel: 'e', template: 't' } })];
    const out = await advanceRun(runtimeDeps(d), run(), steps);
    expect(d.audit).toHaveBeenCalledOnce();
    expect(Array.isArray((out.run.context as { __steps?: unknown[] }).__steps)).toBe(true);
  });
});

// ── C3: effect-idempotency ledger hook ───────────────────────────────────────
describe('workflow runtime — effect ledger (C3)', () => {
  it('skips execution + reuses the cached result when begin() returns one', async () => {
    const exec = execDeps();
    const steps = [step({ id: 's1', stepNo: 1, stepType: 'notification', config: { channel: 'e', template: 't' } })];
    const begin = vi.fn(async () => ({ status: 'completed' as const }));   // already ran
    const settle = vi.fn(async () => {});
    const deps: RuntimeDeps = { ...runtimeDeps(exec), effectLedger: { begin, settle } };
    const out = await advanceRun(deps, run(), steps);
    expect(out.state).toBe('completed');
    expect(begin).toHaveBeenCalledOnce();
    expect(exec.notify).not.toHaveBeenCalled();   // effect NOT re-fired
    expect(settle).not.toHaveBeenCalled();        // cached path does not settle
  });

  it('claims (begin→null), executes, then settles for a side-effecting step', async () => {
    const exec = execDeps();
    const steps = [step({ id: 's1', stepNo: 1, stepType: 'notification', config: { channel: 'e', template: 't' } })];
    const begin = vi.fn(async () => null);        // claimed → execute
    const settle = vi.fn(async () => {});
    const deps: RuntimeDeps = { ...runtimeDeps(exec), effectLedger: { begin, settle } };
    const out = await advanceRun(deps, run(), steps);
    expect(out.state).toBe('completed');
    expect(exec.notify).toHaveBeenCalledOnce();   // executed once
    expect(settle).toHaveBeenCalledOnce();        // and settled
  });

  it('does NOT consult the ledger for non-effectful steps (condition)', async () => {
    const exec = execDeps({ evalCondition: () => true });
    const steps = [step({ id: 's1', stepNo: 1, stepType: 'condition', condition: { x: 1 } })];
    const begin = vi.fn(async () => null);
    const deps: RuntimeDeps = { ...runtimeDeps(exec), effectLedger: { begin, settle: vi.fn(async () => {}) } };
    await advanceRun(deps, run(), steps);
    expect(begin).not.toHaveBeenCalled();
  });
});
