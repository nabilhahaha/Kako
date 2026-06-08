// ============================================================================
// Commercial Attribution — explanation layer (Phase 4+). Pure. Turns the raw
// attribution records into "why" views for any invoice / return / promotion:
// which promotion applied, who funded it, which incentive/commission triggered,
// and (for returns) what must be reversed. No I/O.
// ============================================================================

import type { AttributionRecord, AttributionRefType } from './types';

const sum = (rs: readonly AttributionRecord[], pick: (r: AttributionRecord) => number | null | undefined): number =>
  Math.round((rs.reduce((s, r) => s + (pick(r) ?? 0), 0) + Number.EPSILON) * 100) / 100;

/** All attribution records for a document. Pure. */
export function recordsFor(records: readonly AttributionRecord[], refType: AttributionRefType, refId: string): AttributionRecord[] {
  return records.filter((r) => r.refType === refType && r.refId === refId);
}

export interface InvoiceExplanation {
  invoiceId: string;
  promotions: { promotionId: string; promotionName?: string | null; promotionType?: string | null }[];
  discountTotal: number;
  freeGoodsTotal: number;
  fundingBySource: { source: string; amount: number }[];
  incentiveTotal: number;
  commissionTotal: number;
}

/** Explain why an invoice looks the way it does. Pure. */
export function explainInvoice(records: readonly AttributionRecord[], invoiceId: string): InvoiceExplanation {
  const rs = [...recordsFor(records, 'invoice', invoiceId), ...recordsFor(records, 'invoice_line', invoiceId)];
  const promos = new Map<string, { promotionId: string; promotionName?: string | null; promotionType?: string | null }>();
  const funding = new Map<string, number>();
  for (const r of rs) {
    if (r.promotionId) promos.set(r.promotionId, { promotionId: r.promotionId, promotionName: r.promotionName, promotionType: r.promotionType });
    if (r.fundingSource) funding.set(r.fundingSource, (funding.get(r.fundingSource) ?? 0) + (r.supplierShare ?? 0) + (r.companyShare ?? 0) + (r.distributorShare ?? 0));
  }
  return {
    invoiceId,
    promotions: [...promos.values()],
    discountTotal: sum(rs, (r) => r.discountAmount),
    freeGoodsTotal: rs.reduce((s, r) => s + (r.freeGoodsQty ?? 0), 0),
    fundingBySource: [...funding.entries()].map(([source, amount]) => ({ source, amount: Math.round(amount * 100) / 100 })),
    incentiveTotal: sum(rs, (r) => r.incentiveAmount),
    commissionTotal: sum(rs, (r) => r.commissionAmount),
  };
}

export interface ReturnExplanation {
  returnId: string;
  freeGoodsReversed: number;
  discountReversed: number;
  fundingImpact: number;
  incentiveImpact: number;
  commissionImpact: number;
  roiImpact: number;
}

/** Explain what a return reverses. Pure. */
export function explainReturn(records: readonly AttributionRecord[], returnId: string): ReturnExplanation {
  const rs = recordsFor(records, 'return', returnId);
  return {
    returnId,
    freeGoodsReversed: rs.reduce((s, r) => s + (r.freeGoodsQty ?? 0), 0),
    discountReversed: sum(rs, (r) => r.discountAmount),
    fundingImpact: sum(rs, (r) => (r.supplierShare ?? 0) + (r.companyShare ?? 0) + (r.distributorShare ?? 0)),
    incentiveImpact: sum(rs, (r) => r.incentiveAmount),
    commissionImpact: sum(rs, (r) => r.commissionAmount),
    roiImpact: sum(rs, (r) => r.roiImpact),
  };
}

export interface PromotionExplanation {
  promotionId: string;
  salesGenerated: number;
  cost: number;
  returnsImpact: number;
  incentiveCost: number;
  commissionCost: number;
}

/** Explain a promotion's commercial footprint. Pure. */
export function explainPromotion(records: readonly AttributionRecord[], promotionId: string): PromotionExplanation {
  const rs = records.filter((r) => r.promotionId === promotionId);
  return {
    promotionId,
    salesGenerated: sum(rs, (r) => r.netSales ?? r.grossSales),
    cost: sum(rs, (r) => (r.supplierShare ?? 0) + (r.companyShare ?? 0) + (r.distributorShare ?? 0) + (r.discountAmount ?? 0)),
    returnsImpact: sum(rs.filter((r) => r.refType === 'return'), (r) => r.returnImpactValue ?? r.netSales),
    incentiveCost: sum(rs, (r) => r.incentiveAmount),
    commissionCost: sum(rs, (r) => r.commissionAmount),
  };
}
