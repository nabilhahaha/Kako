import { redirect } from 'next/navigation';

/**
 * M3-D redirect stub — Action Policies is now a tab of the consolidated Roles &
 * Permissions page. Same admin gate (Company-Admin OR Platform-Owner) at the
 * destination; bookmarks/deep links preserved.
 */
export default function ActionPoliciesRedirect() {
  redirect('/settings/authz?tab=action-policies');
}
