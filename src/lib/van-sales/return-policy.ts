// Return Approval — PURE policy resolution (no I/O). Decides, per return, whether
// it is BLOCKED (closed mode), posts immediately (AUTO), or needs APPROVAL — from
// the company's policy mode + per-type rules (require-approval flag + auto-approve
// value threshold). Value is the return's total. Used by the return screen and the
// request RPC so the UI and server agree. Default-OFF behind platform.return_approval.

export type ReturnPolicyMode = 'open' | 'approval' | 'closed';
export type ReturnTypeKind = 'saleable' | 'damage';
export type ReturnDecision = 'blocked' | 'auto' | 'approval';
export type ApprovalLevel = 'supervisor' | 'branch_manager' | 'company_admin';

export interface ReturnTypeRule {
  /** Always require approval for this type regardless of value (e.g. Damage). */
  requireApproval: boolean;
  /** Auto-approve at or below this value; above → approval. null = no auto band. */
  autoApproveLimit: number | null;
}

export interface ReturnPolicy {
  mode: ReturnPolicyMode;
  rules: Record<ReturnTypeKind, ReturnTypeRule>;
  /** Value bands → approver level (ascending by maxValue). The first band whose
   *  maxValue ≥ value wins; beyond all bands → the last level. Empty → supervisor. */
  levelBands?: { maxValue: number; level: ApprovalLevel }[];
}

/** The default (pilot) policy = Open: everything posts immediately. */
export const DEFAULT_RETURN_POLICY: ReturnPolicy = {
  mode: 'open',
  rules: {
    saleable: { requireApproval: false, autoApproveLimit: null },
    damage: { requireApproval: false, autoApproveLimit: null },
  },
};

/**
 * Resolve what happens to a return of `returnType` worth `valueSAR`. Pure.
 *   • closed mode                     → BLOCKED
 *   • type rule requires approval     → APPROVAL (e.g. Damage, any value)
 *   • open mode                       → AUTO
 *   • approval mode + value ≤ limit   → AUTO
 *   • approval mode + value > limit   → APPROVAL  (no limit set ⇒ APPROVAL)
 */
export function resolveReturnPolicy(returnType: ReturnTypeKind, valueSAR: number, policy: ReturnPolicy): ReturnDecision {
  if (policy.mode === 'closed') return 'blocked';
  const rule = policy.rules?.[returnType];
  if (rule?.requireApproval) return 'approval';
  if (policy.mode === 'open') return 'auto';
  // approval mode → threshold-based.
  const limit = rule?.autoApproveLimit;
  if (limit == null) return 'approval';
  return Number(valueSAR) <= Number(limit) ? 'auto' : 'approval';
}

/** The approver level for a value, from the configured bands. Pure. */
export function resolveApprovalLevel(valueSAR: number, bands?: ReturnPolicy['levelBands']): ApprovalLevel {
  const list = (bands ?? []).slice().sort((a, b) => a.maxValue - b.maxValue);
  for (const b of list) if (Number(valueSAR) <= b.maxValue) return b.level;
  return list.length ? list[list.length - 1].level : 'supervisor';
}

/** Is the Return Approval workflow active for this tenant? (`platform.return_approval`). Pure. */
export function returnApprovalEnabled(flags: Record<string, boolean | undefined> | null | undefined): boolean {
  return Boolean(flags?.['platform.return_approval']);
}
