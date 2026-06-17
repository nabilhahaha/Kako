/**
 * Approval Matrix — pure types + helpers (no I/O). A business-friendly authoring
 * layer over the EXISTING workflow engine: a "matrix" is just a friendlier way to
 * write `erp_workflow_definitions` + `erp_workflow_steps`. No new engine, no new
 * tables.
 *
 * Semantics (cumulative escalation, native to the engine): the steps are
 * sequential approval steps; a step with an "above" amount carries the engine's
 * proven threshold condition `{ when:'amount', op:'gt', value }` (evaluated by
 * erp_workflow_condition_met). So each higher band ADDS its approver on top of the
 * lower ones — e.g. ≤5,000 → Supervisor; >5,000 → Supervisor + Finance;
 * >20,000 → Supervisor + Finance + Director. Identical rows to the manual builder.
 */

export type ApproverType = 'role' | 'company_admin';

export interface ApprovalScenarioDef {
  /** Canonical engine key — a company definition with this key overrides the
   *  global seed via the existing resolver (company-wins-by-key). */
  key: string;
  entity: string;
  trigger: 'manual' | 'event';
  triggerEvent?: string;
  /** Whether amount thresholds apply (credit/price/trade) or it's a plain chain. */
  amountTiered: boolean;
}

/** Curated catalog, each bound to a REAL engine scenario already seeded globally. */
export const APPROVAL_SCENARIOS: ApprovalScenarioDef[] = [
  { key: 'credit_limit_approval_v2', entity: 'credit_limit_request', trigger: 'manual', amountTiered: true },
  { key: 'price_change_approval', entity: 'price_change_request', trigger: 'manual', amountTiered: true },
  { key: 'trade_spend_approval', entity: 'trade_promotion', trigger: 'manual', amountTiered: true },
  { key: 'customer_data_update', entity: 'customer_change_request', trigger: 'event', triggerEvent: 'customer_change_request.submitted', amountTiered: false },
  { key: 'stock_request_approval', entity: 'stock_request', trigger: 'manual', amountTiered: false },
];

export function scenarioByKey(key: string): ApprovalScenarioDef | undefined {
  return APPROVAL_SCENARIOS.find((s) => s.key === key);
}

export interface MatrixTier {
  approverType: ApproverType;
  approverRef: string | null;  // role key when approverType==='role'
  /** Approvers engage when the amount is ABOVE this (0 = always). Ignored for
   *  non-amount-tiered scenarios. */
  aboveAmount: number;
}

/** A step row ready to insert into erp_workflow_steps (same shape the manual
 *  builder's addStep produces). */
export interface StepRowInput {
  stepNo: number;
  approverType: ApproverType;
  approverRef: string | null;
  condition: { when: 'amount'; op: 'gt'; value: string } | null;
}

/** Compile tiers → ordered approval step rows (cumulative; ascending by amount). */
export function tiersToStepRows(tiers: MatrixTier[], amountTiered: boolean): StepRowInput[] {
  const ordered = amountTiered
    ? [...tiers].sort((a, b) => a.aboveAmount - b.aboveAmount)
    : [...tiers];
  return ordered.map((t, i) => ({
    stepNo: i + 1,
    approverType: t.approverType,
    approverRef: t.approverType === 'role' ? (t.approverRef || null) : null,
    condition: amountTiered && t.aboveAmount > 0
      ? { when: 'amount', op: 'gt', value: String(Math.trunc(t.aboveAmount)) }
      : null,
  }));
}

/** Parse existing engine step rows back into editable tiers. */
export function stepRowsToTiers(
  steps: { step_no: number; approver_type: string | null; approver_ref: string | null; condition: unknown }[],
): MatrixTier[] {
  return [...steps]
    .sort((a, b) => a.step_no - b.step_no)
    .map((s) => {
      const cond = (s.condition && typeof s.condition === 'object' ? s.condition : null) as
        | { when?: string; value?: string } | null;
      const above = cond && cond.when === 'amount' && cond.value != null ? Number(cond.value) : 0;
      return {
        approverType: (s.approver_type === 'company_admin' ? 'company_admin' : 'role') as ApproverType,
        approverRef: s.approver_ref ?? null,
        aboveAmount: Number.isFinite(above) ? above : 0,
      };
    });
}

/** Validate a set of tiers before saving. Returns a list of problem codes. */
export function validateTiers(tiers: MatrixTier[], amountTiered: boolean): string[] {
  const problems: string[] = [];
  if (tiers.length === 0) { problems.push('empty'); return problems; }

  for (const t of tiers) {
    if (t.approverType === 'role' && !t.approverRef) { problems.push('missing_approver'); break; }
  }
  if (amountTiered) {
    const amounts = tiers.map((t) => t.aboveAmount);
    if (amounts.some((a) => !Number.isFinite(a) || a < 0)) problems.push('bad_amount');
    if (new Set(amounts).size !== amounts.length) problems.push('duplicate_threshold');
  }
  return problems;
}
