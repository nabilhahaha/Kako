// ============================================================================
// Workflow step executor framework (Constitution Art. 32, runtime layer).
//
// ONE runtime over the SINGLE engine: each step_type has an executor with
// validate / execute / audit / error-handling. Approval-family steps delegate to
// the existing approval engine (tasks + erp_workflow_decide); automated steps run
// here. Executors are pure over an injected `ExecutorDeps`, so the registry +
// runtime are fully unit-testable without a database or network.
// ============================================================================

import type { WorkflowStepType } from '../types';

/** Outcome of executing one step. */
export type StepStatus = 'completed' | 'failed' | 'paused' | 'waiting';

export interface StepResult {
  status: StepStatus;
  branch?: 'success' | 'failure';     // routing hint (condition / pass-fail)
  output?: Record<string, unknown>;   // merged into run context
  error?: string;
  retryable?: boolean;                 // failed → eligible for capped retry
  waitUntil?: number;                  // epoch ms, for status 'waiting' (delay/SLA)
}

/** Minimal run state the executors/runtime need (subset of erp_workflow_instances). */
export interface RunState {
  id: string;
  companyId: string;
  branchId: string | null;
  definitionId: string;
  entity: string;
  recordId: string;
  currentStepId: string | null;       // null = start at the first step
  context: Record<string, unknown>;   // accumulated variables + step outputs
  attempts: number;
  actorId: string | null;             // originating user (for impersonation/audit)
}

/** A step as the runtime sees it (subset of erp_workflow_steps + 0176 columns). */
export interface RuntimeStep {
  id: string;
  stepNo: number;
  stepType: WorkflowStepType;
  name: string | null;
  config: Record<string, unknown>;
  approverType: string | null;
  approverRef: string | null;
  slaHours: number | null;
  escalateTo: string | null;
  condition: Record<string, unknown> | null;
  nextOnSuccess: string | null;       // step id
  nextOnFailure: string | null;       // step id
}

export interface StepContext {
  run: RunState;
  step: RuntimeStep;
  deps: ExecutorDeps;
}

export interface StepExecutor {
  type: WorkflowStepType;
  /** Static config validation; returns human-readable errors ([] = valid). */
  validate(step: RuntimeStep): string[];
  /** Perform the step. MUST NOT throw for expected failures — return a failed
   *  StepResult; the runtime treats thrown errors as retryable failures. */
  execute(ctx: StepContext): Promise<StepResult>;
}

/** Side-effect operations injected into executors (mockable in tests). */
export interface ExecutorDeps {
  now(): number;
  /** Ensure the approval task(s) for an approval step exist (reuses the engine). */
  ensureApprovalTask(run: RunState, step: RuntimeStep): Promise<void>;
  /** Latest human decision for this step's task: 'approved' | 'rejected' | null (still pending). */
  approvalDecision(run: RunState, step: RuntimeStep): Promise<'approved' | 'rejected' | null>;
  /** Send a notification (reuses Notification OS / erp_notify). */
  notify(input: { run: RunState; channel: string; template: string; to: string; vars: Record<string, unknown> }): Promise<void>;
  /** Create a generic task. */
  createTask(input: { run: RunState; title: string; assigneeType: string; assigneeRef: string | null; dueAt: number | null }): Promise<{ taskId: string }>;
  /** Update a business record (table allow-list enforced by the executor). */
  updateRecord(input: { table: string; id: string; patch: Record<string, unknown>; companyId: string }): Promise<void>;
  /** Outbound HTTP (api_call). Egress is allow-listed (approved domains + connectors)
   *  by the adapter; a denied call returns status 403 (non-retryable) — never fires. */
  httpCall(input: { method: string; url: string; headers?: Record<string, string>; body?: unknown; connector?: string | null }): Promise<{ status: number; body: unknown }>;
  /** Escalate (reuses the engine's escalation/notify). */
  escalate(run: RunState, step: RuntimeStep): Promise<void>;
  /** Evaluate a condition over the run context (reuses condition semantics). */
  evalCondition(condition: Record<string, unknown>, vars: Record<string, unknown>): boolean;
  /** Append an audit entry (emitted as a workflow.step.* domain event). */
  audit(entry: { run: RunState; step: RuntimeStep; result: StepResult }): Promise<void>;
}

/** Tables an update_record step is permitted to touch (security allow-list). */
export const UPDATE_RECORD_ALLOWLIST = new Set<string>([
  'erp_customers', 'erp_invoices', 'erp_sales_orders', 'erp_workflow_instances',
  // Customer Data Update (8F-2): the approval step flips the change request status.
  'erp_customer_change_requests',
  // Van Sales (Phase B): the load-request approval chain flips the request status.
  'erp_stock_requests',
  // Van Sales (Phase B): the variance-review workflow resolves the confirmation.
  'erp_van_load_confirmations',
  // Universal Change Request engine: the approval workflow flips the request status
  // (the master-data apply itself goes through erp_change_request_apply, allowlisted
  // separately in the change-requests registry).
  'erp_change_requests',
]);
