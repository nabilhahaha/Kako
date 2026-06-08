// ============================================================================
// Commercial Excellence — credit management engine (Phase 7). Pure. Enterprise
// credit control: aging buckets, available/used/remaining credit, customer risk,
// and order-blocking decisions (hard/soft/warning/approval) driven by configurable
// triggers (limit exceeded / overdue / high risk / collection issue). No I/O.
// ============================================================================

export interface OpenInvoice { amount: number; daysOverdue: number }  // outstanding per invoice

export interface AgingBuckets {
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d91_120: number;
  d121_180: number;
  d180_plus: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Bucket open invoices by days overdue. Pure. */
export function agingBuckets(invoices: readonly OpenInvoice[]): AgingBuckets {
  const b: AgingBuckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d91_120: 0, d121_180: 0, d180_plus: 0 };
  for (const i of invoices) {
    const d = i.daysOverdue;
    if (d <= 0) b.current += i.amount;
    else if (d <= 30) b.d1_30 += i.amount;
    else if (d <= 60) b.d31_60 += i.amount;
    else if (d <= 90) b.d61_90 += i.amount;
    else if (d <= 120) b.d91_120 += i.amount;
    else if (d <= 180) b.d121_180 += i.amount;
    else b.d180_plus += i.amount;
  }
  (Object.keys(b) as (keyof AgingBuckets)[]).forEach((k) => (b[k] = round2(b[k])));
  return b;
}

export interface CreditState {
  creditLimit: number;
  usedCredit: number;        // current outstanding balance
}

/** Available / remaining credit. Pure. */
export function availableCredit(s: CreditState): number {
  return round2(s.creditLimit - s.usedCredit);
}

export interface CreditRiskInputs {
  overdueAmount: number;
  outstandingAmount: number;
  creditLimit: number;
  daysSinceLastPayment: number | null;
}

/** 0..100 customer risk score (higher = riskier). Pure. */
export function customerRiskScore(i: CreditRiskInputs): number {
  let score = 0;
  if (i.outstandingAmount > 0) score += Math.min(40, (i.overdueAmount / i.outstandingAmount) * 40);
  if (i.creditLimit > 0) score += Math.min(35, (i.outstandingAmount / i.creditLimit) * 35);
  if (i.daysSinceLastPayment != null) score += Math.min(25, (i.daysSinceLastPayment / 90) * 25);
  return Math.round(Math.max(0, Math.min(100, score)));
}

export type BlockMode = 'hard_block' | 'soft_block' | 'warning' | 'approval_required' | 'none';
export type BlockTrigger = 'credit_limit_exceeded' | 'overdue_balance' | 'high_risk' | 'collection_issue';

/** Company-configurable trigger → block-mode policy. */
export type CreditBlockPolicy = Partial<Record<BlockTrigger, BlockMode>>;

export const DEFAULT_CREDIT_BLOCK_POLICY: CreditBlockPolicy = {
  credit_limit_exceeded: 'hard_block',
  overdue_balance: 'approval_required',
  high_risk: 'warning',
  collection_issue: 'soft_block',
};

export interface OrderCreditCheckInput {
  orderAmount: number;
  credit: CreditState;
  overdueAmount: number;
  riskScore: number;
  hasCollectionIssue?: boolean;
  highRiskThreshold?: number;   // default 70
}

export interface OrderCreditDecision {
  triggered: BlockTrigger[];
  mode: BlockMode;              // most restrictive triggered mode
}

const SEVERITY: Record<BlockMode, number> = { none: 0, warning: 1, soft_block: 2, approval_required: 3, hard_block: 4 };

/** Decide the order-blocking outcome from triggers + policy (most restrictive wins). Pure. */
export function checkOrderCredit(input: OrderCreditCheckInput, policy: CreditBlockPolicy = DEFAULT_CREDIT_BLOCK_POLICY): OrderCreditDecision {
  const triggered: BlockTrigger[] = [];
  if (input.credit.usedCredit + input.orderAmount > input.credit.creditLimit && input.credit.creditLimit > 0) triggered.push('credit_limit_exceeded');
  if (input.overdueAmount > 0) triggered.push('overdue_balance');
  if (input.riskScore >= (input.highRiskThreshold ?? 70)) triggered.push('high_risk');
  if (input.hasCollectionIssue) triggered.push('collection_issue');
  const mode = triggered.map((t) => policy[t] ?? 'none').reduce<BlockMode>((worst, m) => (SEVERITY[m] > SEVERITY[worst] ? m : worst), 'none');
  return { triggered, mode };
}
