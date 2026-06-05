/**
 * Global Roles & Permissions administration — pure logic (no I/O), unit-tested.
 *
 * Backs the platform "Global Roles" editor that manages the role catalog
 * (`erp_roles`) and its default permissions (`erp_role_permissions`) which seed
 * every new company. Pure helpers: key validation, permission diffing, role
 * comparison, and the "dangerous permission" classification used to warn the
 * operator before granting elevated capabilities.
 */
import { ALL_PERMISSIONS, type Permission } from './permissions';

const ROLE_KEY_RE = /^[a-z][a-z0-9_]{1,31}$/;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/** A role key is a stable slug: lowercase, starts with a letter, 2–32 chars. */
export function validateRoleKey(key: string, existingKeys: readonly string[] = []): ValidationResult {
  const errors: string[] = [];
  if (!ROLE_KEY_RE.test(key)) errors.push('key_format');
  if (existingKeys.includes(key)) errors.push('key_taken');
  return { ok: errors.length === 0, errors };
}

/** Normalize free-text into a valid role key (best effort). */
export function slugifyRoleKey(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+/, '').slice(0, 32);
}

/**
 * Permissions that confer elevated / financial / destructive / administrative
 * power. The UI surfaces a warning when one of these is granted to a role, so an
 * operator doesn't widen the blast radius of a low-trust role by accident.
 * (Flat-permission level — what `erp_role_permissions` stores.)
 */
export const DANGEROUS_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>([
  // Administration / identity
  'settings.users', 'settings.branches', 'settings.custom_fields',
  'integrations.manage', 'workflow.manage',
  'user.import', 'user.transfer',
  // Money / accounting
  'accounting.post', 'sales.discount', 'credit.request.approve',
  'customers.approve', 'customers.change_status',
  // Data movement / bulk
  'customer.import', 'customer.transfer', 'product.import',
  // Approvals that bypass controls
  'stock_request.approve', 'stock.transfer.approve',
  'visit.override_gps', 'visit.approve_out_of_route', 'day.approve_close_exception',
]);

export function isDangerousPermission(perm: string): boolean {
  return DANGEROUS_PERMISSIONS.has(perm as Permission);
}

/** Keep only permissions that exist in the catalog (drops stale/typo keys). */
export function sanitizePermissions(perms: readonly string[]): Permission[] {
  const valid = new Set(ALL_PERMISSIONS as string[]);
  return [...new Set(perms.filter((p) => valid.has(p)))] as Permission[];
}

export interface PermissionDiff {
  added: string[];
  removed: string[];
}

/** What changes when a role's permission set goes from `current` to `next`. */
export function permissionDiff(current: readonly string[], next: readonly string[]): PermissionDiff {
  const cur = new Set(current);
  const nxt = new Set(next);
  return {
    added: [...nxt].filter((p) => !cur.has(p)),
    removed: [...cur].filter((p) => !nxt.has(p)),
  };
}

export interface RoleComparison {
  onlyA: string[];
  onlyB: string[];
  shared: string[];
}

/** Compare two roles' permission sets (for the side-by-side compare view). */
export function compareRoles(a: readonly string[], b: readonly string[]): RoleComparison {
  const setA = new Set(a);
  const setB = new Set(b);
  return {
    onlyA: [...setA].filter((p) => !setB.has(p)).sort(),
    onlyB: [...setB].filter((p) => !setA.has(p)).sort(),
    shared: [...setA].filter((p) => setB.has(p)).sort(),
  };
}

/** Whether a role may be deleted (system roles are protected). */
export function canDeleteRole(isSystem: boolean): boolean {
  return !isSystem;
}
