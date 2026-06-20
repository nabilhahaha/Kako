import { redirect } from 'next/navigation';

/**
 * M3-A redirect stub — Templates is now a tab of the consolidated Workflows
 * page. The destination re-checks the `workflow.manage` gate; bookmarks/deep
 * links are preserved.
 */
export default function WorkflowTemplatesRedirect() {
  redirect('/settings/workflows?tab=templates');
}
