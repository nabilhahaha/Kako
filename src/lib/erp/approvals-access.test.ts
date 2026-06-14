import { describe, it, expect } from 'vitest';
import { canSeeWorkflowInbox } from './approvals-access';
import type { PermissionContext } from './permissions';

const ctx = (perms: string[]): PermissionContext => ({
  permissions: perms as PermissionContext['permissions'],
  isSuperAdmin: false,
  isPlatformOwner: false,
});

describe('canSeeWorkflowInbox', () => {
  it('workflow.manage holders (legacy operators)', () => {
    expect(canSeeWorkflowInbox(ctx(['workflow.manage']))).toBe(true);
  });

  it('P1 approvers reach the inbox (closes the access gap)', () => {
    expect(canSeeWorkflowInbox(ctx(['credit.request.approve']))).toBe(true);
    expect(canSeeWorkflowInbox(ctx(['pricing.manage']))).toBe(true);
  });

  it('unrelated permissions do not', () => {
    expect(canSeeWorkflowInbox(ctx(['sales.sell', 'reports.view']))).toBe(false);
    expect(canSeeWorkflowInbox(ctx([]))).toBe(false);
  });

  it('super admin / platform owner always can', () => {
    expect(canSeeWorkflowInbox({ permissions: [], isSuperAdmin: true })).toBe(true);
    expect(canSeeWorkflowInbox({ permissions: [], isSuperAdmin: false, isPlatformOwner: true })).toBe(true);
  });
});
