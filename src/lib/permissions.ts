import type { UserRole } from './types';

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  manager: 'Sales Manager',
  supervisor: 'Supervisor',
  merchandiser: 'Merchandiser',
  data_team: 'Data Team',
};

export const ROLE_HOME: Record<UserRole, string> = {
  admin: '/dashboard',
  manager: '/dashboard',
  supervisor: '/dashboard',
  merchandiser: '/visits',
  data_team: '/dashboard',
};

export function homeForRole(role?: UserRole | null): string {
  if (!role) return '/login';
  return ROLE_HOME[role] ?? '/login';
}

export function canAccessModule(role: UserRole, module: string): boolean {
  const access: Record<string, UserRole[]> = {
    dashboard: ['admin', 'manager', 'supervisor', 'merchandiser', 'data_team'],
    customers: ['admin', 'manager', 'supervisor', 'merchandiser', 'data_team'],
    visits: ['admin', 'manager', 'supervisor', 'merchandiser'],
    approvals: ['admin', 'manager', 'data_team'],
    'data-requests': ['admin', 'manager', 'supervisor', 'merchandiser', 'data_team'],
    reports: ['admin', 'manager', 'supervisor', 'data_team'],
    settings: ['admin'],
    audit: ['admin', 'manager'],
  };
  return (access[module] ?? []).includes(role);
}
