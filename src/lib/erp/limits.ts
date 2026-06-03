/** Authorization Phase 4 (P4) — Constraint axis: per-subject NUMERIC authority.
 *
 *  Source of truth for enforcement is the database: erp_within_limit() (RLS-side,
 *  migration 0122) and the opt-in workflow amount check. These TS types + helpers
 *  let the app REASON about a subject's authority (e.g. show "you can approve up
 *  to SAR 50,000") WITHOUT re-implementing enforcement — the DB still decides.
 *
 *  CUTOVER-SAFE: with no erp_role_limits rows, resolveLimit() returns null
 *  (unconstrained) and withinLimit() returns true — mirroring erp_within_limit's
 *  zero-rows no-op. */

/** Capability-style actions a numeric limit can be declared against. These are
 *  the net-new finer capabilities (deny-all until P6) plus the approval/override
 *  actions where an amount/percent cap is meaningful. Keep in sync with the
 *  `action` values seeded into erp_role_limits and referenced by workflow
 *  definitions' `approval_action`. */
export const LIMIT_ACTIONS = [
  'purchasing.po.approve',
  'accounting.voucher.approve',
  'inventory.adjustment.approve',
  'sales.return.approve',
  'sales.payment.writeoff',
  'sales.price.override',
  'sales.order.discount',
  'sales.invoice.discount',
] as const;

export type LimitAction = (typeof LIMIT_ACTIONS)[number];

export function isLimitAction(value: string): value is LimitAction {
  return (LIMIT_ACTIONS as readonly string[]).includes(value);
}

/** One declared numeric authority row. Exactly one subject: a specific `userId`
 *  (authoritative override) OR a `roleKey` (role default). A null cap = unlimited
 *  for that facet. Mirrors one erp_role_limits row. */
export interface RoleLimit {
  id: string;
  companyId: string;
  userId: string | null;
  roleKey: string | null;
  action: string;
  maxAmount: number | null;
  maxPercent: number | null;
}

/** The effective authority for a (subject, action): null caps = unlimited. A null
 *  RETURN from resolveLimit means "no constraint declared" (unconstrained). */
export interface EffectiveLimit {
  maxAmount: number | null;
  maxPercent: number | null;
}

/** Maps a raw erp_role_limits row (snake_case) into a typed RoleLimit. Read helper
 *  only — no enforcement. */
export function toRoleLimit(row: {
  id: string;
  company_id: string;
  user_id: string | null;
  role_key: string | null;
  action: string;
  max_amount: number | string | null;
  max_percent: number | string | null;
}): RoleLimit {
  const num = (v: number | string | null): number | null =>
    v === null || v === '' ? null : typeof v === 'string' ? Number(v) : v;
  return {
    id: row.id,
    companyId: row.company_id,
    userId: row.user_id,
    roleKey: row.role_key,
    action: row.action,
    maxAmount: num(row.max_amount),
    maxPercent: num(row.max_percent),
  };
}

/** Resolve the effective limit for a user/action from a set of rows, mirroring
 *  erp_within_limit's precedence EXACTLY:
 *    1. a USER-specific row is authoritative (overrides role rows);
 *    2. else the MOST PERMISSIVE role-default row across the user's roles
 *       (any null cap ⇒ unlimited for that facet, else the MAX);
 *    3. no applicable row ⇒ null (unconstrained).
 *  `rows` should already be scoped to the user's company (RLS does this). */
export function resolveLimit(
  rows: readonly RoleLimit[],
  userId: string,
  roles: readonly string[],
  action: string,
): EffectiveLimit | null {
  const userRow = rows.find((r) => r.userId === userId && r.action === action);
  if (userRow) {
    return { maxAmount: userRow.maxAmount, maxPercent: userRow.maxPercent };
  }
  const roleRows = rows.filter(
    (r) => r.userId === null && r.roleKey !== null && roles.includes(r.roleKey) && r.action === action,
  );
  if (roleRows.length === 0) return null;
  // most permissive: a null cap means unlimited; otherwise the max across rows.
  const maxAmount = roleRows.some((r) => r.maxAmount === null)
    ? null
    : Math.max(...roleRows.map((r) => r.maxAmount as number));
  const maxPercent = roleRows.some((r) => r.maxPercent === null)
    ? null
    : Math.max(...roleRows.map((r) => r.maxPercent as number));
  return { maxAmount, maxPercent };
}

/** Whether a (user, action, amount[, percent]) is within authority — mirrors
 *  erp_within_limit. Unconstrained (no rows) ⇒ true. Null caps ⇒ that facet
 *  unbounded. For display/optimistic checks only; the DB enforces. */
export function withinLimit(
  rows: readonly RoleLimit[],
  userId: string,
  roles: readonly string[],
  action: string,
  amount: number | null,
  percent: number | null = null,
): boolean {
  const eff = resolveLimit(rows, userId, roles, action);
  if (eff === null) return true;
  const amountOk = eff.maxAmount === null || amount === null || amount <= eff.maxAmount;
  const percentOk = eff.maxPercent === null || percent === null || percent <= eff.maxPercent;
  return amountOk && percentOk;
}
