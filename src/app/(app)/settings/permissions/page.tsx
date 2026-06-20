import { redirect } from 'next/navigation';

/**
 * M3-D redirect stub — the global permission matrix is now the (super-admin-only)
 * Permissions tab of the consolidated Roles & Permissions page. The destination
 * lists/renders this tab only for super-admins and keeps the setRolePermission
 * super-admin server guard, matching the prior superAdminOnly nav gating.
 */
export default function PermissionsRedirect() {
  redirect('/settings/authz?tab=permissions');
}
