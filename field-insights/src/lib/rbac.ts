import type { Role } from '@/stores/session';

// Role hierarchy (higher rank = broader authority). Used for coarse UI gating;
// the database RLS policies are the real enforcement boundary.
const RANK: Record<Role, number> = {
  platform_admin: 70,
  business_manager: 60,
  regional_manager: 50,
  area_manager: 40,
  supervisor: 30,
  field_user: 20,
  viewer: 10,
};

export const ROLE_LABELS: Record<Role, string> = {
  platform_admin: 'Platform Admin',
  business_manager: 'Business Manager',
  regional_manager: 'Regional Manager',
  area_manager: 'Area Manager',
  supervisor: 'Supervisor',
  field_user: 'Field User',
  viewer: 'Viewer',
};

export function rankOf(role: Role): number {
  return RANK[role] ?? 0;
}

export function atLeast(role: Role | null | undefined, min: Role): boolean {
  return !!role && rankOf(role) >= rankOf(min);
}

export const isAdmin = (role: Role | null | undefined) => atLeast(role, 'business_manager');

// Can the user create/capture field data (everyone except viewer)?
export const canCapture = (role: Role | null | undefined) => !!role && role !== 'viewer';

// Can the user manage master data (customers/users/config)?
export const canManageMasterData = (role: Role | null | undefined) => atLeast(role, 'area_manager');
