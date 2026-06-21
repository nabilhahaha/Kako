import { describe, it, expect } from 'vitest';
import { resolveAssignees, stageState, canApprove, statusForStage, flowHasSteps, type ApprovalContext, type FlowEvent } from './route-planner-approval-engine';
import type { RpApprovalStep } from './route-planner-backend';
import type { RpNode } from './route-planner-reporting';

const node = (userId: string, role: string | null, p: string | null = null): RpNode => ({
  userId, name: userId, email: null, role, primaryManagerId: p, secondaryManagerId: null, seeAll: false, inGraph: true,
});

// rep → sup → mgr → admin
const NODES: RpNode[] = [
  node('admin', 'route_planner_admin'),
  node('mgr', 'manager', 'admin'),
  node('sup', 'supervisor', 'mgr'),
  node('rep', 'field_user', 'sup'),
  node('sup2', 'supervisor', 'mgr'),
];
const ctx: ApprovalContext = { requesterId: 'rep', nodes: NODES };

describe('resolveAssignees', () => {
  it('By Specific User', () => expect(resolveAssignees({ stage: 'approve', assignBy: 'user', userId: 'sup' }, ctx)).toEqual(['sup']));
  it('By Role returns all users with that role', () =>
    expect(resolveAssignees({ stage: 'approve', assignBy: 'role', role: 'supervisor' }, ctx).sort()).toEqual(['sup', 'sup2']));
  it('Reporting Line: direct manager of the requester', () =>
    expect(resolveAssignees({ stage: 'approve', assignBy: 'relation', relation: 'direct_manager' }, ctx)).toEqual(['sup']));
  it("Reporting Line: manager's manager", () =>
    expect(resolveAssignees({ stage: 'approve', assignBy: 'relation', relation: 'managers_manager' }, ctx)).toEqual(['mgr']));
  it('Reporting Line: subtree = whole upward line', () =>
    expect(resolveAssignees({ stage: 'approve', assignBy: 'relation', relation: 'subtree' }, ctx).sort()).toEqual(['admin', 'mgr', 'sup']));
});

const FLOW: RpApprovalStep[] = [
  { stage: 'create', assignBy: 'role', role: 'field_user' },
  { stage: 'review', assignBy: 'relation', relation: 'direct_manager' },   // index 1 → sup
  { stage: 'approve', assignBy: 'role', role: 'manager' },                  // index 2 → mgr
  { stage: 'close', assignBy: 'role', role: 'route_planner_admin' },        // index 3 → admin
];

describe('stageState progression', () => {
  it('first pending step is the first non-create step', () => {
    const s = stageState(FLOW, ctx, [{ kind: 'create', by: 'rep' }]);
    expect(s.pending?.index).toBe(1);
    expect(s.pending?.assignees).toEqual(['sup']);
    expect(statusForStage(s)).toBe('pending_manager_review');
  });
  it('advances after the pending step is approved', () => {
    const events: FlowEvent[] = [{ kind: 'create', by: 'rep' }, { kind: 'approve', step: 1, by: 'sup' }];
    const s = stageState(FLOW, ctx, events);
    expect(s.pending?.index).toBe(2);
    expect(s.pending?.assignees).toEqual(['mgr']);
  });
  it('reaches done when all steps approved; status closed', () => {
    const events: FlowEvent[] = [
      { kind: 'approve', step: 1, by: 'sup' }, { kind: 'approve', step: 2, by: 'mgr' }, { kind: 'approve', step: 3, by: 'admin' },
    ];
    const s = stageState(FLOW, ctx, events);
    expect(s.done).toBe(true);
    expect(statusForStage(s)).toBe('closed');
  });
});

describe('Any-Of / All-Of', () => {
  const anyFlow: RpApprovalStep[] = [{ stage: 'approve', assignBy: 'role', role: 'supervisor', mode: 'any' }];
  const allFlow: RpApprovalStep[] = [{ stage: 'approve', assignBy: 'role', role: 'supervisor', mode: 'all' }];
  it('Any-Of completes on a single approval', () => {
    expect(stageState(anyFlow, ctx, [{ kind: 'approve', step: 0, by: 'sup' }]).done).toBe(true);
  });
  it('All-Of needs every assignee', () => {
    expect(stageState(allFlow, ctx, [{ kind: 'approve', step: 0, by: 'sup' }]).done).toBe(false);
    expect(stageState(allFlow, ctx, [{ kind: 'approve', step: 0, by: 'sup' }, { kind: 'approve', step: 0, by: 'sup2' }]).done).toBe(true);
  });
});

describe('Skip-if-empty', () => {
  it('skips a step that resolves to no assignee', () => {
    const orphan: ApprovalContext = { requesterId: 'lonely', nodes: [node('lonely', 'field_user')] }; // no manager
    const flow: RpApprovalStep[] = [
      { stage: 'review', assignBy: 'relation', relation: 'direct_manager', skipIfEmpty: true }, // empty → skip
      { stage: 'approve', assignBy: 'user', userId: 'lonely' },
    ];
    expect(stageState(flow, orphan, []).pending?.index).toBe(1);
  });
});

describe('canApprove (authority + no self-approval)', () => {
  it('blocks the requester from approving their own ticket', () => {
    expect(canApprove(['rep'], 'rep', 'rep', false)).toBe(false);
    expect(canApprove(['rep', 'sup'], 'rep', 'rep', true)).toBe(false); // even as admin
  });
  it('allows a resolved assignee', () => expect(canApprove(['sup'], 'sup', 'rep', false)).toBe(true));
  it('allows a company admin acting on someone else’s ticket', () => expect(canApprove(['sup'], 'admin', 'rep', true)).toBe(true));
  it('blocks a random non-assignee non-admin', () => expect(canApprove(['sup'], 'mgr', 'rep', false)).toBe(false));
});

describe('flowHasSteps', () => {
  it('false for null / create-only', () => {
    expect(flowHasSteps(null)).toBe(false);
    expect(flowHasSteps([{ stage: 'create', assignBy: 'role', role: 'field_user' }])).toBe(false);
    expect(flowHasSteps(FLOW)).toBe(true);
  });
});
