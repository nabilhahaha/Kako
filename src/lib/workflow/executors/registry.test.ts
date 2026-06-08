import { describe, it, expect, vi } from 'vitest';
import { getExecutor, STEP_EXECUTORS } from './registry';
import type { ExecutorDeps, RunState, RuntimeStep, StepContext } from './types';

const run: RunState = {
  id: 'r1', companyId: 'co1', branchId: 'b1', definitionId: 'd1', entity: 'customer',
  recordId: 'cust1', currentStepId: null, context: { amount: 100 }, attempts: 0, actorId: 'u1',
};
const step = (over: Partial<RuntimeStep> = {}): RuntimeStep => ({
  id: 's1', stepNo: 1, stepType: 'notification', name: null, config: {},
  approverType: null, approverRef: null, slaHours: null, escalateTo: null,
  condition: null, nextOnSuccess: null, nextOnFailure: null, ...over,
});
const deps = (over: Partial<ExecutorDeps> = {}): ExecutorDeps => ({
  now: () => 1000,
  ensureApprovalTask: vi.fn(async () => {}),
  approvalDecision: vi.fn(async () => null),
  notify: vi.fn(async () => {}),
  createTask: vi.fn(async () => ({ taskId: 't1' })),
  updateRecord: vi.fn(async () => {}),
  httpCall: vi.fn(async () => ({ status: 200, body: { ok: true } })),
  escalate: vi.fn(async () => {}),
  evalCondition: vi.fn(() => true),
  audit: vi.fn(async () => {}),
  ...over,
});
const ctx = (s: RuntimeStep, d: ExecutorDeps): StepContext => ({ run, step: s, deps: d });

describe('step executor registry', () => {
  it('has an executor for all 9 step types', () => {
    expect(Object.keys(STEP_EXECUTORS).sort()).toEqual(
      ['api_call', 'approval', 'condition', 'delay', 'escalation', 'notification', 'reject', 'task', 'update_record'].sort(),
    );
  });

  it('approval: ensures a task and pauses when undecided', async () => {
    const d = deps(); const s = step({ stepType: 'approval', approverType: 'company_admin' });
    const r = await getExecutor('approval')!.execute(ctx(s, d));
    expect(r.status).toBe('paused');
    expect(d.ensureApprovalTask).toHaveBeenCalledOnce();
  });
  it('approval: advances (resume) when already approved/rejected', async () => {
    const s = step({ stepType: 'approval', approverType: 'company_admin' });
    const approved = await getExecutor('approval')!.execute(ctx(s, deps({ approvalDecision: async () => 'approved' })));
    expect(approved).toMatchObject({ status: 'completed', branch: 'success' });
    const rejected = await getExecutor('approval')!.execute(ctx(s, deps({ approvalDecision: async () => 'rejected' })));
    expect(rejected).toMatchObject({ status: 'completed', branch: 'failure' });
  });
  it('approval: validate requires approver_type', () => {
    expect(getExecutor('approval')!.validate(step({ stepType: 'approval' }))).toHaveLength(1);
  });

  it('reject: terminal failure branch', async () => {
    const r = await getExecutor('reject')!.execute(ctx(step({ stepType: 'reject' }), deps()));
    expect(r).toMatchObject({ status: 'completed', branch: 'failure' });
  });

  it('notification: validates config and sends', async () => {
    const exec = getExecutor('notification')!;
    expect(exec.validate(step({ config: {} }))).toHaveLength(2);
    const d = deps(); const s = step({ config: { channel: 'email', template: 'welcome', to: 'a@b.c' } });
    const r = await exec.execute(ctx(s, d));
    expect(r.status).toBe('completed');
    expect(d.notify).toHaveBeenCalledOnce();
  });

  it('update_record: rejects a non-allow-listed table; updates an allow-listed one', async () => {
    const exec = getExecutor('update_record')!;
    expect(exec.validate(step({ stepType: 'update_record', config: { table: 'secret_table', patch: {} } }))[0]).toMatch(/allow-listed/);
    const d = deps(); const s = step({ stepType: 'update_record', config: { table: 'erp_customers', patch: { is_vip: true } } });
    const r = await exec.execute(ctx(s, d));
    expect(r.status).toBe('completed');
    expect(d.updateRecord).toHaveBeenCalledWith(expect.objectContaining({ table: 'erp_customers', id: 'cust1' }));
    // 8F-2: the Customer Data Update approval flips the change request status.
    expect(exec.validate(step({ stepType: 'update_record', config: { table: 'erp_customer_change_requests', patch: { status: 'approved' } } }))).toEqual([]);
  });

  it('api_call: 2xx completes, 5xx is retryable, 4xx is permanent', async () => {
    const exec = getExecutor('api_call')!;
    const s = step({ stepType: 'api_call', config: { url: 'https://x', method: 'POST' } });
    expect((await exec.execute(ctx(s, deps()))).status).toBe('completed');
    expect(await exec.execute(ctx(s, deps({ httpCall: async () => ({ status: 503, body: {} }) })))).toMatchObject({ status: 'failed', retryable: true });
    expect(await exec.execute(ctx(s, deps({ httpCall: async () => ({ status: 400, body: {} }) })))).toMatchObject({ status: 'failed', retryable: false });
  });

  it('delay: returns waiting with a future waitUntil', async () => {
    const exec = getExecutor('delay')!;
    expect(exec.validate(step({ stepType: 'delay', config: {} }))).toHaveLength(1);
    const r = await exec.execute(ctx(step({ stepType: 'delay', config: { delay_minutes: 5 } }), deps()));
    expect(r.status).toBe('waiting');
    expect(r.waitUntil).toBe(1000 + 5 * 60_000);
  });

  it('condition: branches on evalCondition', async () => {
    const exec = getExecutor('condition')!;
    const s = step({ stepType: 'condition', condition: { field: 'amount', gt: 50 } });
    expect((await exec.execute(ctx(s, deps({ evalCondition: () => true })))).branch).toBe('success');
    expect((await exec.execute(ctx(s, deps({ evalCondition: () => false })))).branch).toBe('failure');
  });

  it('escalation: validates target and escalates', async () => {
    const exec = getExecutor('escalation')!;
    expect(exec.validate(step({ stepType: 'escalation' }))).toHaveLength(1);
    const d = deps();
    const r = await exec.execute(ctx(step({ stepType: 'escalation', escalateTo: 'manager' }), d));
    expect(r.status).toBe('completed');
    expect(d.escalate).toHaveBeenCalledOnce();
  });
});
