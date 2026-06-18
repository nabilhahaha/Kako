// ============================================================================
// Role Governance — action / field / Entity-360 section security + temporary
// access (Phase 7). Pure. Action security (separate from data scope), field-level
// view/edit/hidden resolution, Entity-360 section visibility per role, and
// effective-dated temporary access grants with automatic expiry. No I/O.
// ============================================================================

// ── Action security ────────────────────────────────────────────────────────
/** True when any of the user's roles grants `action`. Pure. */
export function canPerform(grantedActions: readonly string[], action: string): boolean {
  return grantedActions.includes(action);
}

// ── Field-level security ───────────────────────────────────────────────────
export type FieldAccess = 'hidden' | 'view' | 'edit';
const FIELD_RANK: Record<FieldAccess, number> = { hidden: 0, view: 1, edit: 2 };

export interface FieldRule { role: string; field: string; access: FieldAccess }

/** Most-permissive field access across a user's roles (default hidden). Pure. */
export function resolveFieldAccess(rules: readonly FieldRule[], roles: readonly string[], field: string): FieldAccess {
  const applicable = rules.filter((r) => r.field === field && roles.includes(r.role));
  if (applicable.length === 0) return 'hidden';
  return applicable.reduce<FieldAccess>((best, r) => (FIELD_RANK[r.access] > FIELD_RANK[best] ? r.access : best), 'hidden');
}

/** True when the field may be edited. Pure. */
export function canEditField(rules: readonly FieldRule[], roles: readonly string[], field: string): boolean {
  return resolveFieldAccess(rules, roles, field) === 'edit';
}

// ── Entity-360 section security ────────────────────────────────────────────
export interface SectionRule { role: string; entity: string; section: string; visible: boolean }

/** Sections of an Entity-360 a user's roles may see. Pure. */
export function visibleSections(rules: readonly SectionRule[], roles: readonly string[], entity: string): string[] {
  const allowed = new Set<string>();
  for (const r of rules) if (r.entity === entity && r.visible && roles.includes(r.role)) allowed.add(r.section);
  return [...allowed].sort();
}

// ── Temporary access (effective-dated, auto-expiry) ────────────────────────
export interface TemporaryGrant {
  userId: string;
  grant: string;            // e.g. a role or permission key
  effectiveFrom: string;    // ISO
  effectiveTo: string;      // ISO
}

/** True when a temporary grant is active at `now`. Pure (auto-expiry by time). */
export function isGrantActive(g: TemporaryGrant, now: string): boolean {
  return g.effectiveFrom <= now && now <= g.effectiveTo;
}

/** The grant keys currently active for a user at `now`. Pure. */
export function activeGrants(grants: readonly TemporaryGrant[], userId: string, now: string): string[] {
  return grants.filter((g) => g.userId === userId && isGrantActive(g, now)).map((g) => g.grant);
}

/** Split active grant keys into direct permission keys vs role keys (which must
 *  be expanded to their permissions). Deduped. Pure — used by the enforcement
 *  wiring in getUserContext. `allPermissions` is the permission allowlist. */
export function partitionGrantKeys(
  keys: readonly string[],
  allPermissions: readonly string[],
): { perms: string[]; roleKeys: string[] } {
  const permSet = new Set(allPermissions);
  const perms: string[] = [];
  const roleKeys: string[] = [];
  for (const k of new Set(keys)) (permSet.has(k) ? perms : roleKeys).push(k);
  return { perms, roleKeys };
}

// ── User Access Overrides (operational, per-user grant/revoke) ───────────────
// Pure delegability logic + override application. The DB function
// erp_is_delegable_permission mirrors this exactly (belt-and-suspenders). The
// operational allowlist is the only thing a Company Admin may grant/revoke; the
// deny-list can NEVER be delegated regardless of the allowlist.

/** The operational permissions a Company Admin may grant/revoke per user. */
export const DELEGABLE_OPERATIONAL_PERMISSIONS = [
  'customer.request',
  'stock_request.create',
  'cash.handover.request',
  'day.reopen.request',
  'returns.create',
  'sales.discount',
] as const;

/** Immutable deny-list: classes that can NEVER be delegated, even if mistakenly
 *  added to the allowlist. Mirrors the SQL belt in erp_is_delegable_permission. */
export function isNonDelegablePermission(perm: string): boolean {
  return (
    /^platform\./.test(perm) ||
    /^security\./.test(perm) ||
    /^rls\./.test(perm) ||
    /^treasury\./.test(perm) ||
    perm === 'super.admin' ||
    perm === 'integrations.manage' ||
    perm === 'accounting.post' ||
    perm === 'settings.users'
  );
}

/** True when `perm` is an operational permission a Company Admin may delegate. */
export function isDelegableOperationalPermission(perm: string): boolean {
  return (
    (DELEGABLE_OPERATIONAL_PERMISSIONS as readonly string[]).includes(perm) &&
    !isNonDelegablePermission(perm)
  );
}

export interface AccessOverride {
  permission: string;
  effect: 'grant' | 'revoke';
}

/** Apply per-user operational overrides on top of a base permission set:
 *  grants add, revokes remove — both bounded by the delegable operational set
 *  (re-validated here, so a stored override outside the set is ignored). Pure. */
export function applyAccessOverrides(
  base: readonly string[],
  overrides: readonly AccessOverride[],
  isDelegable: (perm: string) => boolean = isDelegableOperationalPermission,
): { effective: string[]; appliedGrants: string[]; appliedRevokes: string[] } {
  const valid = overrides.filter((o) => isDelegable(o.permission));
  const appliedGrants = [...new Set(valid.filter((o) => o.effect === 'grant').map((o) => o.permission))];
  const appliedRevokes = [...new Set(valid.filter((o) => o.effect === 'revoke').map((o) => o.permission))];
  const set = new Set(base);
  for (const p of appliedGrants) set.add(p);
  for (const p of appliedRevokes) set.delete(p);
  return { effective: [...set], appliedGrants, appliedRevokes };
}

/** Effective-permissions diff for a user: role baseline vs. effective, with the
 *  applied operational grants/revokes that explain the difference. Pure. */
export function effectivePermissionsDiff(
  baseline: readonly string[],
  overrides: readonly AccessOverride[],
  isDelegable: (perm: string) => boolean = isDelegableOperationalPermission,
): {
  baseline: string[];
  effective: string[];
  addedByGrant: string[];
  removedByRevoke: string[];
} {
  const { effective, appliedGrants, appliedRevokes } = applyAccessOverrides(baseline, overrides, isDelegable);
  const baseSet = new Set(baseline);
  return {
    baseline: [...baseline],
    effective,
    // only count grants that actually changed the set (weren't already present)
    addedByGrant: appliedGrants.filter((p) => !baseSet.has(p)),
    removedByRevoke: appliedRevokes.filter((p) => baseSet.has(p)),
  };
}
