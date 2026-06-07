// ============================================================================
// Step executor registry — one executor per step_type (Constitution Art. 32).
// Approval-family steps reuse the existing engine; automated steps run inline.
// Every executor: validate (config) + execute (side effect via deps) + audit
// (runtime records each result) + error handling (return failed, never crash).
// ============================================================================

import type { WorkflowStepType } from '../types';
import type { StepExecutor, StepResult, RuntimeStep } from './types';
import { UPDATE_RECORD_ALLOWLIST } from './types';

const ok = (over: Partial<StepResult> = {}): StepResult => ({ status: 'completed', ...over });
const fail = (error: string, retryable = false): StepResult => ({ status: 'failed', error, retryable });
const str = (v: unknown): string => (v == null ? '' : String(v));

// — Approval: pause the run and ensure an approval task exists (engine reuse) —
const approval: StepExecutor = {
  type: 'approval',
  validate: (s) => (s.approverType ? [] : ['approval step requires approver_type']),
  execute: async ({ run, step, deps }) => {
    // Resume-aware: if the task is already decided, advance; else create + pause.
    const decision = await deps.approvalDecision(run, step);
    if (decision === 'approved') return ok({ branch: 'success', output: { approval: 'approved' } });
    if (decision === 'rejected') return ok({ branch: 'failure', output: { approval: 'rejected' } });
    await deps.ensureApprovalTask(run, step);
    return { status: 'paused' }; // resumed by resumeRun() once the task is decided
  },
};

// — Reject: terminal failure branch —
const reject: StepExecutor = {
  type: 'reject',
  validate: () => [],
  execute: async () => ({ status: 'completed', branch: 'failure', output: { decision: 'rejected' } }),
};

// — Notification —
const notification: StepExecutor = {
  type: 'notification',
  validate: (s) => {
    const e: string[] = [];
    if (!s.config.channel) e.push('notification requires config.channel');
    if (!s.config.template) e.push('notification requires config.template');
    return e;
  },
  execute: async ({ run, step, deps }) => {
    await deps.notify({
      run, channel: str(step.config.channel), template: str(step.config.template),
      to: str(step.config.to), vars: (step.config.vars as Record<string, unknown>) ?? run.context,
    });
    return ok();
  },
};

// — Create Task —
const createTask: StepExecutor = {
  type: 'task',
  validate: (s) => (s.config.title ? [] : ['task requires config.title']),
  execute: async ({ run, step, deps }) => {
    const dueAt = step.config.due_in_hours != null ? deps.now() + Number(step.config.due_in_hours) * 3600_000 : null;
    const { taskId } = await deps.createTask({
      run, title: str(step.config.title),
      assigneeType: str(step.config.assignee_type || 'company_admin'),
      assigneeRef: (step.config.assignee_ref as string) ?? null, dueAt,
    });
    return ok({ output: { task_id: taskId } });
  },
};

// — Update Record (table allow-listed for security) —
const updateRecord: StepExecutor = {
  type: 'update_record',
  validate: (s) => {
    const e: string[] = [];
    const table = str(s.config.table);
    if (!table) e.push('update_record requires config.table');
    else if (!UPDATE_RECORD_ALLOWLIST.has(table)) e.push(`table '${table}' is not allow-listed for update_record`);
    if (!s.config.patch || typeof s.config.patch !== 'object') e.push('update_record requires config.patch object');
    return e;
  },
  execute: async ({ run, step, deps }) => {
    const table = str(step.config.table);
    // id source: explicit config.id, else the run's subject record.
    const id = str(step.config.id) || run.recordId;
    if (!id) return fail('update_record: no target id');
    await deps.updateRecord({ table, id, patch: step.config.patch as Record<string, unknown>, companyId: run.companyId });
    return ok({ output: { updated_table: table, updated_id: id } });
  },
};

// — API Call (outbound HTTP) —
const apiCall: StepExecutor = {
  type: 'api_call',
  validate: (s) => {
    const e: string[] = [];
    if (!s.config.url) e.push('api_call requires config.url');
    const m = str(s.config.method || 'POST').toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(m)) e.push(`api_call invalid method ${m}`);
    return e;
  },
  execute: async ({ step, deps }) => {
    const res = await deps.httpCall({
      method: str(step.config.method || 'POST').toUpperCase(),
      url: str(step.config.url),
      headers: (step.config.headers as Record<string, string>) ?? undefined,
      body: step.config.body,
      connector: (step.config.connector as string) ?? null,
    });
    if (res.status >= 500) return fail(`api_call ${res.status}`, true);       // retryable
    if (res.status >= 400) return fail(`api_call ${res.status}`, false);      // permanent
    return ok({ output: { status: res.status, response: res.body } });
  },
};

// — Wait / Delay (pauses the run until waitUntil; resumed by the tick) —
const wait: StepExecutor = {
  type: 'delay',
  validate: (s) => {
    const ms = Number(s.config.delay_ms ?? 0) + Number(s.config.delay_minutes ?? 0) * 60_000 + Number(s.config.delay_hours ?? 0) * 3600_000;
    return ms > 0 ? [] : ['delay requires a positive delay_ms / delay_minutes / delay_hours'];
  },
  execute: async ({ step, deps }) => {
    const ms = Number(step.config.delay_ms ?? 0) + Number(step.config.delay_minutes ?? 0) * 60_000 + Number(step.config.delay_hours ?? 0) * 3600_000;
    return { status: 'waiting', waitUntil: deps.now() + ms };
  },
};

// — Escalation —
const escalation: StepExecutor = {
  type: 'escalation',
  validate: (s) => (s.escalateTo || s.config.escalate_to ? [] : ['escalation requires escalate_to']),
  execute: async ({ run, step, deps }) => { await deps.escalate(run, step); return ok(); },
};

// — Condition (branches success/failure; no side effect) —
const condition: StepExecutor = {
  type: 'condition',
  validate: (s) => (s.condition || s.config.condition ? [] : ['condition requires a condition expression']),
  execute: async ({ run, step, deps }) => {
    const cond = (step.condition ?? (step.config.condition as Record<string, unknown>)) ?? {};
    const met = deps.evalCondition(cond, run.context);
    return { status: 'completed', branch: met ? 'success' : 'failure', output: { condition_met: met } };
  },
};

export const STEP_EXECUTORS: Record<WorkflowStepType, StepExecutor> = {
  approval, reject, notification, task: createTask, update_record: updateRecord,
  api_call: apiCall, delay: wait, escalation, condition,
};

export function getExecutor(type: WorkflowStepType): StepExecutor | undefined {
  return STEP_EXECUTORS[type];
}
