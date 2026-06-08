// ============================================================================
// Commercial Attribution — dashboards + raw-data export (Phase 4+). Pure rollups
// for the promotion-profitability / employee-incentive / commission-control /
// return-impact dashboards, plus a flat raw-data projection for Excel/CSV/Power BI.
// No I/O.
// ============================================================================

import type { AttributionRecord } from './types';

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const s = (rs: readonly AttributionRecord[], p: (r: AttributionRecord) => number | null | undefined): number =>
  round2(rs.reduce((a, r) => a + (p(r) ?? 0), 0));

/** Promotion profitability dashboard (sales/cost/GP/ROI/returns impact per promo). Pure. */
export function promotionProfitability(records: readonly AttributionRecord[]) {
  const byPromo = new Map<string, AttributionRecord[]>();
  for (const r of records) if (r.promotionId) (byPromo.get(r.promotionId) ?? byPromo.set(r.promotionId, []).get(r.promotionId)!).push(r);
  return [...byPromo.entries()].map(([promotionId, rs]) => {
    const sales = s(rs, (r) => r.netSales ?? r.grossSales);
    const cost = s(rs, (r) => (r.supplierShare ?? 0) + (r.companyShare ?? 0) + (r.distributorShare ?? 0) + (r.discountAmount ?? 0));
    return { promotionId, sales, cost, returnsImpact: s(rs.filter((r) => r.refType === 'return'), (r) => r.returnImpactValue ?? r.netSales), netRoi: round2(s(rs, (r) => r.roiImpact)), gp: round2(sales - cost) };
  }).sort((a, b) => b.netRoi - a.netRoi);
}

/** Employee incentives dashboard (earned/paid per salesman). Pure. */
export function employeeIncentives(records: readonly AttributionRecord[]) {
  const by = new Map<string, number>();
  for (const r of records) if (r.salesmanId && r.incentiveAmount != null) by.set(r.salesmanId, (by.get(r.salesmanId) ?? 0) + r.incentiveAmount);
  return [...by.entries()].map(([salesmanId, earned]) => ({ salesmanId, earned: round2(earned) })).sort((a, b) => b.earned - a.earned);
}

/** Commission control dashboard (accrued/reversed/net per salesman). Pure. */
export function commissionControl(records: readonly AttributionRecord[]) {
  const by = new Map<string, { accrued: number; reversed: number }>();
  for (const r of records) {
    if (r.commissionAmount == null || !r.salesmanId) continue;
    const g = by.get(r.salesmanId) ?? { accrued: 0, reversed: 0 };
    if (r.refType === 'return') g.reversed += r.commissionAmount; else g.accrued += r.commissionAmount;
    by.set(r.salesmanId, g);
  }
  return [...by.entries()].map(([salesmanId, g]) => ({ salesmanId, accrued: round2(g.accrued), reversed: round2(g.reversed), net: round2(g.accrued - g.reversed) }));
}

/** Return-impact dashboard grouped by a dimension. Pure. */
export function returnImpact(records: readonly AttributionRecord[], by: 'promotionId' | 'customerId' | 'salesmanId') {
  const rs = records.filter((r) => r.refType === 'return');
  const acc = new Map<string, number>();
  for (const r of rs) { const k = String((r as unknown as Record<string, unknown>)[by] ?? 'unknown'); acc.set(k, (acc.get(k) ?? 0) + (r.returnImpactValue ?? r.netSales ?? 0)); }
  return [...acc.entries()].map(([key, value]) => ({ key, value: round2(value) })).sort((a, b) => b.value - a.value);
}

/** Flat raw-data rows (all attribution fields) for Excel/CSV/Power BI/warehouse. Pure. */
export function toRawDataRows(records: readonly AttributionRecord[]): Record<string, unknown>[] {
  return records.map((r) => ({ ...r }));
}
