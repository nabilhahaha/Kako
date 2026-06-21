/** Pure cross-company guard for tenant-user management. Kept out of the `'use server'`
 *  action module so the scoping decision is unit-testable without server-only deps.
 *  `setCompanyUserActive` uses this to ensure a mis-scoped id can never mutate a user in
 *  another tenant: the target must appear in the membership rows fetched for THIS company. */
export function isCompanyMember(memberships: { user_id: string }[], userId: string): boolean {
  return memberships.some((m) => m.user_id === userId);
}
