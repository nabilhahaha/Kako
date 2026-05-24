import type { UserRole } from './types';

export const ROLE_LABELS_AR: Record<UserRole, string> = {
  admin_relia: 'مشرف النظام',
  presales_rep: 'مندوب مبيعات',
  presales_supervisor: 'مشرف مبيعات',
  cashvan_supervisor: 'مشرف الكاش فان',
  regional_manager_roshen: 'مدير إقليمي',
  trade_marketing_manager: 'مدير التسويق التجاري',
  top_management_relia: 'الإدارة العليا - ريليا',
  top_management_roshen: 'الإدارة العليا - روشن',
};

export const ROLE_HOME: Record<UserRole, string> = {
  admin_relia: '/admin',
  presales_rep: '/salesman',
  presales_supervisor: '/supervisor',
  cashvan_supervisor: '/supervisor',
  regional_manager_roshen: '/regional',
  trade_marketing_manager: '/unauthorized',
  top_management_relia: '/unauthorized',
  top_management_roshen: '/unauthorized',
};

export function homeForRole(role: UserRole | null | undefined): string {
  if (!role) return '/unauthorized';
  return ROLE_HOME[role] ?? '/unauthorized';
}

export function hasRole(userRole: UserRole | null | undefined, allowed: UserRole[]): boolean {
  if (!userRole) return false;
  return allowed.includes(userRole);
}
