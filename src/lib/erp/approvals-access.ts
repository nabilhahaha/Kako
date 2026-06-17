import { hasPermission, type PermissionContext, type Permission } from './permissions';

/**
 * Permissions that grant access to the Workflow Inbox (the engine-driven
 * approvals surface). `workflow.manage` is the broad operator permission; the
 * P1 approver permissions are added so credit-limit / trade-spend / price-change
 * approvers can REACH the inbox where their tasks now surface (the inbox query
 * already filters to tasks they can act on). UI-reachability only — every
 * decision is still re-authorised server-side by the engine.
 */
const WORKFLOW_INBOX_PERMS: Permission[] = [
  'workflow.manage',
  'credit.request.approve',
  // pricing.manage covers both trade-spend and price-change approvers
  // (it alias-covers the granular pricing.rule.edit checked by the legacy action).
  'pricing.manage',
];

export function canSeeWorkflowInbox(ctx: PermissionContext): boolean {
  return WORKFLOW_INBOX_PERMS.some((p) => hasPermission(ctx, p));
}
