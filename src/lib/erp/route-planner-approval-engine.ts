import type { RpApprovalStep, RpTicketStatus } from './route-planner-backend';
import type { RpNode } from './route-planner-reporting';

/**
 * Approval execution engine (pure) — turns a configured Approval Builder flow into a
 * live, enforceable workflow for a Request Center ticket. Resolves the assignees for
 * each step (By Role / Reporting Line / Specific User), tracks which step is pending
 * from the ticket's event log, honours All-Of / Any-Of and Skip-if-empty, and decides
 * who may advance a step.
 *
 * Routing/tracking only — approving a ticket never edits master data.
 */

export interface ApprovalContext {
  /** The ticket's creator (drives reporting-line resolution; can never self-approve). */
  requesterId: string;
  /** Company reporting/role rows (erp_route_planner_access mapped to nodes). */
  nodes: RpNode[];
}

export interface FlowEvent { kind: 'create' | 'approve' | 'reject' | 'info'; step?: number; by: string; at?: string; note?: string | null }

const managersOf = (nodes: RpNode[], id: string): string[] => {
  const n = nodes.find((x) => x.userId === id);
  if (!n) return [];
  return [n.primaryManagerId, n.secondaryManagerId].filter((x): x is string => !!x);
};

/** All ancestors of a user up the reporting line (primary + secondary), cycle-safe. */
function upline(nodes: RpNode[], id: string): string[] {
  const out: string[] = []; const seen = new Set([id]); const stack = [id];
  while (stack.length) {
    const c = stack.pop()!;
    for (const m of managersOf(nodes, c)) if (!seen.has(m)) { seen.add(m); out.push(m); stack.push(m); }
  }
  return out;
}

/** Resolve the user-ids a step assigns to, for a given ticket context. */
export function resolveAssignees(step: RpApprovalStep, ctx: ApprovalContext): string[] {
  switch (step.assignBy) {
    case 'user': return step.userId ? [step.userId] : [];
    case 'role': return ctx.nodes.filter((n) => n.role === step.role).map((n) => n.userId);
    case 'relation':
      if (step.relation === 'direct_manager') return managersOf(ctx.nodes, ctx.requesterId);
      if (step.relation === 'managers_manager') return [...new Set(managersOf(ctx.nodes, ctx.requesterId).flatMap((m) => managersOf(ctx.nodes, m)))];
      if (step.relation === 'subtree') return upline(ctx.nodes, ctx.requesterId);
      return [];
    default: return [];
  }
}

/** Action steps = everything after the implicit 'create' (submission) step. */
export function actionSteps(steps: RpApprovalStep[]): { index: number; step: RpApprovalStep }[] {
  return steps.map((step, index) => ({ index, step })).filter((s) => s.step.stage !== 'create');
}

export interface PendingStep { index: number; step: RpApprovalStep; assignees: string[]; approvedBy: string[]; remaining: string[] }
export interface StageState { pending: PendingStep | null; done: boolean }

/**
 * The current pending action step, derived from the event log. Skips steps that resolve
 * to no assignee when flagged skipIfEmpty; a step is satisfied when enough of its
 * assignees have approved (Any-Of = 1, All-Of = everyone).
 */
export function stageState(steps: RpApprovalStep[], ctx: ApprovalContext, events: FlowEvent[]): StageState {
  for (const { index, step } of actionSteps(steps)) {
    const assignees = resolveAssignees(step, ctx);
    if (assignees.length === 0 && step.skipIfEmpty) continue;
    const approvedBy = [...new Set(events.filter((e) => e.kind === 'approve' && e.step === index).map((e) => e.by))].filter((u) => assignees.includes(u));
    const need = (step.mode ?? 'all') === 'any' ? 1 : assignees.length;
    const satisfied = assignees.length > 0 && approvedBy.length >= need;
    if (!satisfied) return { pending: { index, step, assignees, approvedBy, remaining: assignees.filter((u) => !approvedBy.includes(u)) }, done: false };
  }
  return { pending: null, done: true };
}

/** Can this user approve the pending step? Never the requester (no self-approval);
 *  otherwise a resolved assignee, or a company admin acting on someone else's ticket. */
export function canApprove(pendingAssignees: string[], actingUserId: string, requesterId: string, isAdmin: boolean): boolean {
  if (actingUserId === requesterId) return false;
  return pendingAssignees.includes(actingUserId) || isAdmin;
}

/** Map the live stage to a Request Center status for display/listing. */
export function statusForStage(state: StageState): RpTicketStatus {
  if (state.done) return 'closed';
  const stage = state.pending?.step.stage;
  if (stage === 'implement') return 'pending_admin_action';
  if (stage === 'close') return 'approved';
  return 'pending_manager_review';
}

/** True when the flow has at least one actionable step. */
export function flowHasSteps(steps: RpApprovalStep[] | null | undefined): boolean {
  return !!steps && actionSteps(steps).length > 0;
}
