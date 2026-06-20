import { redirect } from 'next/navigation';

/**
 * M3-A redirect stub — Approvals is now the first tab of the consolidated
 * Workflows page. The destination re-checks the `workflow.manage` gate, so this
 * is a gate-free passthrough that preserves bookmarks/deep links.
 */
export default function ApprovalMatrixRedirect() {
  redirect('/settings/workflows?tab=approvals');
}
