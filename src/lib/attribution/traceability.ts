// ============================================================================
// Commercial Attribution — incentive & commission traceability (Phase 4+). Pure.
// Every incentive payout and commission is explainable down to the transactions
// that generated it (click-through drill-down). No I/O.
// ============================================================================

import type { AttributionRecord } from './types';

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const uniq = (xs: (string | null | undefined)[]): string[] => [...new Set(xs.filter((x): x is string => !!x))];

export interface IncentiveTrace {
  employeeId: string;
  role?: string | null;
  programId?: string | null;
  period?: string | null;
  target?: number | null;
  actual?: number | null;
  achievementPct?: number | null;
  gross: number;
  deductions: number;
  net: number;
  relatedInvoiceIds: string[];
  relatedCustomerIds: string[];
  relatedPromotionIds: string[];
  relatedReturnIds: string[];
}

/** Build an incentive trace for an employee (+optional program). Pure. */
export function buildIncentiveTrace(
  records: readonly AttributionRecord[],
  employeeId: string,
  opts: { programId?: string; role?: string; target?: number; actual?: number; deductions?: number } = {},
): IncentiveTrace {
  const rs = records.filter((r) => r.salesmanId === employeeId && (opts.programId ? r.incentiveProgramId === opts.programId : true) && r.incentiveAmount != null);
  const gross = round2(rs.reduce((s, r) => s + (r.incentiveAmount ?? 0), 0));
  const deductions = round2(opts.deductions ?? 0);
  return {
    employeeId,
    role: opts.role ?? null,
    programId: opts.programId ?? null,
    period: rs[0]?.period ?? null,
    target: opts.target ?? null,
    actual: opts.actual ?? null,
    achievementPct: opts.target && opts.target > 0 && opts.actual != null ? round2((opts.actual / opts.target) * 100) : null,
    gross,
    deductions,
    net: round2(gross - deductions),
    relatedInvoiceIds: uniq(rs.filter((r) => r.refType === 'invoice' || r.refType === 'invoice_line').map((r) => r.refId)),
    relatedCustomerIds: uniq(rs.map((r) => r.customerId)),
    relatedPromotionIds: uniq(rs.map((r) => r.promotionId)),
    relatedReturnIds: uniq(rs.filter((r) => r.refType === 'return').map((r) => r.refId)),
  };
}

/** Drill-down: the attribution rows behind an employee's incentive. Pure. */
export function incentiveDrilldown(records: readonly AttributionRecord[], employeeId: string, programId?: string): AttributionRecord[] {
  return records.filter((r) => r.salesmanId === employeeId && (programId ? r.incentiveProgramId === programId : true) && r.incentiveAmount != null);
}

export interface CommissionTrace {
  salesmanId: string;
  ruleId?: string | null;
  period?: string | null;
  accrued: number;
  reversed: number;       // from returns
  net: number;
  relatedInvoiceIds: string[];
  relatedReturnIds: string[];
}

/** Build a commission trace for a salesman (accrued − return reversals). Pure. */
export function buildCommissionTrace(records: readonly AttributionRecord[], salesmanId: string, ruleId?: string): CommissionTrace {
  const rs = records.filter((r) => r.salesmanId === salesmanId && (ruleId ? r.commissionRuleId === ruleId : true) && r.commissionAmount != null);
  const accrued = round2(rs.filter((r) => r.refType !== 'return').reduce((s, r) => s + (r.commissionAmount ?? 0), 0));
  const reversed = round2(rs.filter((r) => r.refType === 'return').reduce((s, r) => s + (r.commissionAmount ?? 0), 0));
  return {
    salesmanId,
    ruleId: ruleId ?? null,
    period: rs[0]?.period ?? null,
    accrued,
    reversed,
    net: round2(accrued - reversed),
    relatedInvoiceIds: uniq(rs.filter((r) => r.refType !== 'return').map((r) => r.refId)),
    relatedReturnIds: uniq(rs.filter((r) => r.refType === 'return').map((r) => r.refId)),
  };
}
