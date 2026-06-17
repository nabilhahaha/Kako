/**
 * Workflow Inbox — "can this user act on this task?" predicate.
 *
 * Mirrors the engine's authorization (erp_workflow_user_can_act) so the inbox
 * shows EXACTLY the tasks a user is allowed to decide. Previously the inbox only
 * surfaced `company_admin` and `user` tasks, which silently hid `role`- and
 * `permission`-assigned tasks even though the engine authorises them — the gap
 * that left credit-limit approvers (who hold a permission) with no UI path.
 * Extracted as a pure function so it is unit-testable and shared.
 *
 * Platform-owner is intentionally NOT granted here: the inbox is a tenant-scoped
 * work surface, and platform staff act through the platform console, not a
 * company's approval inbox.
 */
export interface WorkflowTaskAssignee {
  assignee_type: string;
  assignee_ref: string | null;
}

export interface InboxActor {
  userId: string;
  /** The user's branch role keys (for `role` assignees). */
  roles: readonly string[];
  /** The user's effective permissions (for `permission` assignees). */
  permissions: readonly string[];
  /** Whether the user is a company admin (for `company_admin` assignees). */
  isCompanyAdmin: boolean;
}

export function isActionableWorkflowTask(task: WorkflowTaskAssignee, actor: InboxActor): boolean {
  switch (task.assignee_type) {
    case 'company_admin':
      return actor.isCompanyAdmin;
    case 'user':
      return task.assignee_ref != null && task.assignee_ref === actor.userId;
    case 'role':
      return task.assignee_ref != null && actor.roles.includes(task.assignee_ref);
    case 'permission':
      return task.assignee_ref != null && actor.permissions.includes(task.assignee_ref);
    default:
      return false;
  }
}
