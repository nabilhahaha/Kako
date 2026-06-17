// End Day Approval & Settlement — PURE, policy-driven workflow engine (no I/O).
// A van day is NOT closed when the salesman taps End Day; it is submitted and runs a
// CONFIGURABLE chain of stages before it is truly Closed. Mirrors the Return Approval
// engine: Capability (platform.day_close_approval) → Company Policy (which stages,
// what role per stage, order, separation-of-duties) → Role Permission (who may act).
// Nothing hardcoded — "Supervisor / Warehouse / Cashier" are just roles a company
// assigns to the three generic stages. Reusable for small co → enterprise FMCG.

export type DayCloseStage = 'supervisor' | 'reconcile' | 'settle';

/** Day-close request status (the session is 'closed' only at the end of the chain). */
export type DayCloseStatus =
  | 'pending_supervisor' | 'supervisor_rejected'
  | 'pending_reconciliation' | 'reconciliation_rejected'
  | 'pending_settlement' | 'settlement_rejected'
  | 'closed' | 'reopened';

export const DAY_CLOSE_STAGES: DayCloseStage[] = ['supervisor', 'reconcile', 'settle'];

/** Pending status that means "awaiting this stage". */
export function pendingStatusFor(stage: DayCloseStage): DayCloseStatus {
  return stage === 'supervisor' ? 'pending_supervisor'
    : stage === 'reconcile' ? 'pending_reconciliation'
    : 'pending_settlement';
}

/** Rejected status produced when this stage rejects. */
export function rejectedStatusFor(stage: DayCloseStage): DayCloseStatus {
  return stage === 'supervisor' ? 'supervisor_rejected'
    : stage === 'reconcile' ? 'reconciliation_rejected'
    : 'settlement_rejected';
}

/** The stage a pending status refers to (or null for terminal/rejected states). */
export function stageOfStatus(status: DayCloseStatus): DayCloseStage | null {
  return status === 'pending_supervisor' ? 'supervisor'
    : status === 'pending_reconciliation' ? 'reconcile'
    : status === 'pending_settlement' ? 'settle'
    : null;
}

/** The always-on permission key that gates acting on a stage. */
export function stagePermission(stage: DayCloseStage): string {
  return stage === 'supervisor' ? 'day.close.supervisor'
    : stage === 'reconcile' ? 'day.close.reconcile'
    : 'day.close.settle';
}

/** One enabled stage, with the role the company assigned to it ('any' = any holder). */
export interface DayCloseStageDef {
  stage: DayCloseStage;
  role: string; // role key (e.g. 'supervisor', 'warehouse_keeper', 'cashier') or 'any'
}

export interface DayClosePolicy {
  /** 'direct' = no approval chain (today's immediate close). 'custom' = run stages. */
  mode: 'direct' | 'custom';
  /** Enabled stages, already in execution order. Empty ⇒ direct close. */
  stages: DayCloseStageDef[];
  /** When true, a user who acted on one stage cannot act on another (enterprise). */
  separationOfDuties: boolean;
  slaHours?: number | null;
}

/** Default = Direct close (backward compatible; today's behaviour). */
export const DEFAULT_DAY_CLOSE_POLICY: DayClosePolicy = {
  mode: 'direct', stages: [], separationOfDuties: false, slaHours: null,
};

/** Raw per-company config (as stored) → a normalized, ordered, enabled chain. Pure. */
export function buildChain(raw: {
  mode?: string | null;
  supervisorEnabled?: boolean | null; reconcileEnabled?: boolean | null; settleEnabled?: boolean | null;
  supervisorRole?: string | null; reconcileRole?: string | null; settleRole?: string | null;
  stageOrder?: (string | null)[] | null;
}): DayCloseStageDef[] {
  if ((raw.mode ?? 'direct') === 'direct') return [];
  const enabled: Record<DayCloseStage, { on: boolean; role: string }> = {
    supervisor: { on: raw.supervisorEnabled === true, role: raw.supervisorRole || 'supervisor' },
    reconcile: { on: raw.reconcileEnabled === true, role: raw.reconcileRole || 'any' },
    settle: { on: raw.settleEnabled === true, role: raw.settleRole || 'any' },
  };
  const order = (raw.stageOrder && raw.stageOrder.length
    ? raw.stageOrder.filter((s): s is DayCloseStage => s === 'supervisor' || s === 'reconcile' || s === 'settle')
    : DAY_CLOSE_STAGES);
  // Append any enabled stage missing from a partial order, in canonical order.
  const ordered = [...order, ...DAY_CLOSE_STAGES.filter((s) => !order.includes(s))];
  const seen = new Set<DayCloseStage>();
  const chain: DayCloseStageDef[] = [];
  for (const s of ordered) {
    if (seen.has(s)) continue; seen.add(s);
    if (enabled[s].on) chain.push({ stage: s, role: enabled[s].role });
  }
  return chain;
}

/** First status after submit: pending_<first enabled stage>, or 'closed' for direct. */
export function firstStatus(policy: DayClosePolicy): DayCloseStatus {
  const first = policy.stages[0];
  return first ? pendingStatusFor(first.stage) : 'closed';
}

/** Status after a stage is APPROVED: the next enabled stage, or 'closed' if last. Pure. */
export function nextStatusAfter(stage: DayCloseStage, policy: DayClosePolicy): DayCloseStatus {
  const idx = policy.stages.findIndex((s) => s.stage === stage);
  if (idx < 0) return 'closed';
  const next = policy.stages[idx + 1];
  return next ? pendingStatusFor(next.stage) : 'closed';
}

/** The role a stage is assigned to in this policy (or 'any'). */
export function assignedRole(stage: DayCloseStage, policy: DayClosePolicy): string {
  return policy.stages.find((s) => s.stage === stage)?.role ?? 'any';
}

export interface ActOnStageArgs {
  stage: DayCloseStage;
  policy: DayClosePolicy;
  userId: string;
  userRoles: string[];
  userPerms: string[];
  submitterId: string;
  /** User ids who already acted on earlier stages of THIS day-close. */
  priorActorIds: string[];
  /** Apex (super admin / platform owner) bypass role/SoD but never self-approval. */
  isApex?: boolean;
}

/**
 * May a user act (approve/reject) on `stage`? Pure. Rules:
 *  • never the submitter (no self-approval),
 *  • must hold the stage permission,
 *  • role must match the stage's assigned role (or 'any'),
 *  • if separation-of-duties is ON, must not have acted on an earlier stage.
 * Apex tiers bypass role + SoD (handled by caller) but still cannot self-approve.
 */
export function canActOnStage(args: ActOnStageArgs): boolean {
  if (args.userId === args.submitterId) return false;
  if (args.isApex) return true;
  if (!args.userPerms.includes(stagePermission(args.stage))) return false;
  const role = assignedRole(args.stage, args.policy);
  if (role !== 'any' && !args.userRoles.includes(role)) return false;
  if (args.policy.separationOfDuties && args.priorActorIds.includes(args.userId)) return false;
  return true;
}

/** Is the End Day approval capability active for this tenant? (`platform.day_close_approval`). Pure. */
export function dayCloseApprovalEnabled(flags: Record<string, boolean | undefined> | null | undefined): boolean {
  return Boolean(flags?.['platform.day_close_approval']);
}

/** Is End Day SLA tracking active? (`platform.day_close_sla`). Pure. */
export function dayCloseSlaEnabled(flags: Record<string, boolean | undefined> | null | undefined): boolean {
  return Boolean(flags?.['platform.day_close_sla']);
}
