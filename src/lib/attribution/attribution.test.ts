import { describe, it, expect } from 'vitest';
import {
  ATTRIBUTION_ENABLED,
  recordsFor, explainInvoice, explainReturn, explainPromotion,
  attributePromotion,
  buildIncentiveTrace, incentiveDrilldown, buildCommissionTrace,
  promotionProfitability, employeeIncentives, commissionControl, returnImpact, toRawDataRows,
  type AttributionRecord,
} from './index';

const recs: AttributionRecord[] = [
  { companyId: 'co', refType: 'invoice', refId: 'INV1', promotionId: 'P1', promotionName: 'Ramadan', promotionType: 'free_goods',
    fundingSource: 'supplier', supplierShare: 300, companyShare: 200, discountAmount: 100, freeGoodsQty: 10,
    incentiveProgramId: 'IP1', incentiveAmount: 200, commissionRuleId: 'CR1', commissionAmount: 100,
    grossSales: 5000, netSales: 4900, salesmanId: 'S1', customerId: 'C1', period: '2026-03' },
  { companyId: 'co', refType: 'return', refId: 'R1', promotionId: 'P1', supplierShare: 60, companyShare: 40, discountAmount: 20, freeGoodsQty: 2,
    incentiveAmount: 40, commissionAmount: 20, returnImpactValue: 980, roiImpact: -200, salesmanId: 'S1', customerId: 'C1', period: '2026-03' },
];

describe('attribution/flags', () => {
  it('defaults OFF', () => {
    const prev = process.env.KAKO_ATTRIBUTION;
    delete process.env.KAKO_ATTRIBUTION;
    expect(ATTRIBUTION_ENABLED()).toBe(false);
    process.env.KAKO_ATTRIBUTION = '1';
    expect(ATTRIBUTION_ENABLED()).toBe(true);
    if (prev === undefined) delete process.env.KAKO_ATTRIBUTION; else process.env.KAKO_ATTRIBUTION = prev;
  });
});

describe('attribution/explain', () => {
  it('explains an invoice (promotion, funding, discount, incentive, commission)', () => {
    expect(recordsFor(recs, 'invoice', 'INV1')).toHaveLength(1);
    const e = explainInvoice(recs, 'INV1');
    expect(e.promotions[0].promotionName).toBe('Ramadan');
    expect(e.discountTotal).toBe(100);
    expect(e.freeGoodsTotal).toBe(10);
    expect(e.incentiveTotal).toBe(200);
    expect(e.commissionTotal).toBe(100);
    expect(e.fundingBySource.find((f) => f.source === 'supplier')!.amount).toBe(500);
  });
  it('explains a return (reversals)', () => {
    const e = explainReturn(recs, 'R1');
    expect(e.freeGoodsReversed).toBe(2);
    expect(e.discountReversed).toBe(20);
    expect(e.fundingImpact).toBe(100);
    expect(e.incentiveImpact).toBe(40);
    expect(e.commissionImpact).toBe(20);
    expect(e.roiImpact).toBe(-200);
  });
  it('explains a promotion footprint', () => {
    const e = explainPromotion(recs, 'P1');
    expect(e.incentiveCost).toBe(240);   // 200 + 40
    expect(e.commissionCost).toBe(120);  // 100 + 20
  });
});

describe('attribution/promotion (reuses ROI)', () => {
  it('rolls up promotion attribution + ROI', () => {
    const r = attributePromotion({ promotionId: 'P1', grossSales: 90000, netSales: 90000, qtySold: 1800, freeQty: 180,
      discountValue: 2000, baselineSales: 50000, marginPct: 25, supplierShare: 3000, companyShare: 2000, distributorShare: 1000 });
    expect(r.promotionCost).toBe(8000);            // 3000+2000+1000+2000
    expect(r.roi.incrementalSales).toBe(40000);
    expect(r.roi.incrementalMargin).toBe(10000);
    expect(r.roi.netRoi).toBe(2000);
  });
});

describe('attribution/traceability', () => {
  it('incentive trace drills down to source transactions', () => {
    const t = buildIncentiveTrace(recs, 'S1', { programId: 'IP1', target: 100000, actual: 90000, deductions: 10 });
    expect(t.gross).toBe(200);
    expect(t.net).toBe(190);
    expect(t.achievementPct).toBe(90);
    expect(t.relatedInvoiceIds).toEqual(['INV1']);
    expect(incentiveDrilldown(recs, 'S1', 'IP1')).toHaveLength(1);
  });
  it('commission trace nets returns', () => {
    const t = buildCommissionTrace(recs, 'S1');
    expect(t.accrued).toBe(100);
    expect(t.reversed).toBe(20);
    expect(t.net).toBe(80);
  });
});

describe('attribution/dashboards + raw data', () => {
  it('promotion profitability + incentives + commission + return impact', () => {
    expect(promotionProfitability(recs)[0].promotionId).toBe('P1');
    expect(employeeIncentives(recs)[0]).toEqual({ salesmanId: 'S1', earned: 240 });
    expect(commissionControl(recs)[0]).toEqual({ salesmanId: 'S1', accrued: 100, reversed: 20, net: 80 });
    expect(returnImpact(recs, 'promotionId')[0].key).toBe('P1');
  });
  it('raw data rows expose all fields', () => {
    const rows = toRawDataRows(recs);
    expect(rows[0]).toHaveProperty('promotionId', 'P1');
    expect(rows[0]).toHaveProperty('commissionAmount', 100);
  });
});
