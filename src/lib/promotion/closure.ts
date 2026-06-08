// ============================================================================
// Promotion Platform — automatic closure report (Phase 4+). Pure. Builds the
// promotion-closure payload (before/during/after sales·volume·GP, incremental,
// ROI, payback, cost ratios, claims, incentives, commissions) — REUSING the
// trade-spend ROI engine. The PDF/Excel/dashboard renderers wrap this payload.
// ============================================================================

import { computeRoi, type RoiResult } from '@/lib/trade-spend/roi';

export interface PeriodMetrics { sales: number; volume: number; gp: number }

export interface ClosureInput {
  promotionId: string;
  startDate: string;
  endDate: string;
  budget: number;
  spend: number;
  marginPct: number;
  before: PeriodMetrics;   // run-rate baseline
  during: PeriodMetrics;
  after: PeriodMetrics;
  claims?: number;
  incentivesPaid?: number;
  commissionsPaid?: number;
  customerCount?: number;
  skuCount?: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const div = (a: number, b: number): number | null => (b > 0 ? round2(a / b) : null);

export interface ClosureReport {
  promotionId: string;
  startDate: string;
  endDate: string;
  budget: number;
  spend: number;
  before: PeriodMetrics;
  during: PeriodMetrics;
  after: PeriodMetrics;
  incrementalSales: number;
  incrementalVolume: number;
  incrementalGp: number;
  roi: RoiResult;
  paybackPeriods: number | null;
  costPerCustomer: number | null;
  costPerSku: number | null;
  costPerCase: number | null;
  costPerRiyalSold: number | null;
  claims: number;
  incentivesPaid: number;
  commissionsPaid: number;
}

/** Build the closure report payload. Pure. */
export function buildClosureReport(input: ClosureInput): ClosureReport {
  const roi = computeRoi({ baselineSales: input.before.sales, actualSales: input.during.sales, marginPct: input.marginPct, spend: input.spend });
  const incrementalVolume = round2(input.during.volume - input.before.volume);
  const incrementalGp = round2(input.during.gp - input.before.gp);
  return {
    promotionId: input.promotionId,
    startDate: input.startDate,
    endDate: input.endDate,
    budget: input.budget,
    spend: round2(input.spend),
    before: input.before,
    during: input.during,
    after: input.after,
    incrementalSales: roi.incrementalSales,
    incrementalVolume,
    incrementalGp,
    roi,
    paybackPeriods: roi.incrementalMargin > 0 ? div(input.spend, roi.incrementalMargin) : null,
    costPerCustomer: div(input.spend, input.customerCount ?? 0),
    costPerSku: div(input.spend, input.skuCount ?? 0),
    costPerCase: div(input.spend, input.during.volume),
    costPerRiyalSold: div(input.spend, input.during.sales),
    claims: round2(input.claims ?? 0),
    incentivesPaid: round2(input.incentivesPaid ?? 0),
    commissionsPaid: round2(input.commissionsPaid ?? 0),
  };
}
