import { describe, it, expect } from 'vitest';
import { isActionableWorkflowTask, type InboxActor } from './workflow-inbox';

const actor: InboxActor = {
  userId: 'u1',
  roles: ['branch_manager', 'accountant'],
  permissions: ['credit.request.approve', 'reports.view'],
  isCompanyAdmin: false,
};
const admin: InboxActor = { ...actor, isCompanyAdmin: true };

describe('isActionableWorkflowTask', () => {
  it('company_admin tasks: only company admins', () => {
    const t = { assignee_type: 'company_admin', assignee_ref: null };
    expect(isActionableWorkflowTask(t, actor)).toBe(false);
    expect(isActionableWorkflowTask(t, admin)).toBe(true);
  });

  it('user tasks: only the assigned user', () => {
    expect(isActionableWorkflowTask({ assignee_type: 'user', assignee_ref: 'u1' }, actor)).toBe(true);
    expect(isActionableWorkflowTask({ assignee_type: 'user', assignee_ref: 'u2' }, actor)).toBe(false);
  });

  it('role tasks: users holding that branch role (the previously-hidden case)', () => {
    expect(isActionableWorkflowTask({ assignee_type: 'role', assignee_ref: 'branch_manager' }, actor)).toBe(true);
    expect(isActionableWorkflowTask({ assignee_type: 'role', assignee_ref: 'supervisor' }, actor)).toBe(false);
  });

  it('permission tasks: holders of that permission (closes the credit-limit gap)', () => {
    expect(isActionableWorkflowTask({ assignee_type: 'permission', assignee_ref: 'credit.request.approve' }, actor)).toBe(true);
    expect(isActionableWorkflowTask({ assignee_type: 'permission', assignee_ref: 'workflow.manage' }, actor)).toBe(false);
  });

  it('null assignee_ref is never actionable for role/permission/user', () => {
    expect(isActionableWorkflowTask({ assignee_type: 'role', assignee_ref: null }, actor)).toBe(false);
    expect(isActionableWorkflowTask({ assignee_type: 'permission', assignee_ref: null }, actor)).toBe(false);
    expect(isActionableWorkflowTask({ assignee_type: 'user', assignee_ref: null }, actor)).toBe(false);
  });

  it('unknown assignee types are not actionable', () => {
    expect(isActionableWorkflowTask({ assignee_type: 'department_head', assignee_ref: 'x' }, actor)).toBe(false);
  });
});
