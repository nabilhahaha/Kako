/** ── Platform (vendor-side) staff permissions — catalog ────────────────────
 *
 * The internal-staff tier of the platform: vendor employees with granular
 * permissions, distinct from tenant company users. This is a generic,
 * platform-wide capability — NOT tied to any business type.
 *
 * Roles and permission KEYS live here (single source of truth, like the tenant
 * `permissions.ts`); the role→permission GRANTS live in the DB
 * (`erp_platform_role_permissions`, owner-editable) so they can be adjusted
 * without a deploy. The Platform Owner (`erp_profiles.is_platform_owner`) is the
 * apex and implicitly holds every permission.
 */

/** Granular platform permissions (req 4). */
export const PLATFORM_PERMISSIONS = [
  'view_companies',
  'create_companies',
  'manage_billing',
  'export_data',
  'manage_users',
  'access_support_tickets',
  'access_audit_logs',
] as const;
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

/** Internal staff roles (req 3). 'owner' is NOT a staff role — ownership is the
 *  guarded `is_platform_owner` profile flag, so staff can never create owners. */
export const PLATFORM_ROLES = ['admin', 'sales', 'support', 'implementation', 'finance'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const PLATFORM_PERMISSION_LABELS: Record<PlatformPermission, { en: string; ar: string }> = {
  view_companies: { en: 'View companies', ar: 'عرض الشركات' },
  create_companies: { en: 'Create companies', ar: 'إنشاء الشركات' },
  manage_billing: { en: 'Manage billing', ar: 'إدارة الفوترة' },
  export_data: { en: 'Export data', ar: 'تصدير البيانات' },
  manage_users: { en: 'Manage users', ar: 'إدارة المستخدمين' },
  access_support_tickets: { en: 'Access support tickets', ar: 'الوصول لتذاكر الدعم' },
  access_audit_logs: { en: 'Access audit logs', ar: 'الوصول لسجل التدقيق' },
};

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, { en: string; ar: string }> = {
  admin: { en: 'Admin', ar: 'مسؤول' },
  sales: { en: 'Sales', ar: 'المبيعات' },
  support: { en: 'Support', ar: 'الدعم' },
  implementation: { en: 'Implementation', ar: 'التطبيق' },
  finance: { en: 'Finance', ar: 'المالية' },
};

/** Default role→permission matrix (reference for the UI; the DB is authoritative
 *  and owner-editable). Mirrors the seed in migration 0083. */
export const PLATFORM_ROLE_DEFAULTS: Record<PlatformRole, PlatformPermission[]> = {
  admin: [...PLATFORM_PERMISSIONS],
  sales: ['view_companies', 'create_companies'],
  support: ['view_companies', 'access_support_tickets'],
  implementation: ['view_companies', 'create_companies', 'export_data', 'access_support_tickets'],
  finance: ['view_companies', 'manage_billing', 'export_data', 'access_audit_logs'],
};

export function isPlatformPermission(x: string): x is PlatformPermission {
  return (PLATFORM_PERMISSIONS as readonly string[]).includes(x);
}
export function isPlatformRole(x: string): x is PlatformRole {
  return (PLATFORM_ROLES as readonly string[]).includes(x);
}

/** Expand the DB resolver's result: the owner sentinel '*' becomes the full
 *  catalog; otherwise keep only valid permission keys. */
export function expandPlatformPermissions(raw: string[]): PlatformPermission[] {
  if (raw.includes('*')) return [...PLATFORM_PERMISSIONS];
  return raw.filter(isPlatformPermission);
}
