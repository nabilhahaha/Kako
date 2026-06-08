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
