import { describe, it, expect } from 'vitest';
import {
  VAN_ACCOUNTING_ENABLED,
  reconcileCash,
  reconcileVanLine, reconcileVanInventory, type VanInventoryLine,
  routeProfitability,
  buildVanStatement,
} from './index';

describe('van-accounting/flags', () => {
  it('defaults OFF', () => {
    const prev = process.env.KAKO_VAN_ACCOUNTING;
    delete process.env.KAKO_VAN_ACCOUNTING;
    expect(VAN_ACCOUNTING_ENABLED()).toBe(false);
    process.env.KAKO_VAN_ACCOUNTING = '1';
    expect(VAN_ACCOUNTING_ENABLED()).toBe(true);
    if (prev === undefined) delete process.env.KAKO_VAN_ACCOUNTING; else process.env.KAKO_VAN_ACCOUNTING = prev;
  });
});

describe('cash reconciliation (driver accountability)', () => {
  it('computes expected cash + shortage/overage/balanced', () => {
    const base = { openingCash: 500, cashSales: 3000, cashCollections: 1000, cashReturns: 200, expenses: 300 };
    // expected = 500 + 3000 + 1000 - 200 - 300 = 4000
    expect(reconcileCash({ ...base, countedCash: 4000 })).toMatchObject({ expectedCash: 4000, variance: 0, status: 'balanced' });
    expect(reconcileCash({ ...base, countedCash: 3950 })).toMatchObject({ variance: -50, shortage: 50, overage: 0, status: 'shortage' });
    expect(reconcileCash({ ...base, countedCash: 4075 })).toMatchObject({ variance: 75, overage: 75, status: 'overage' });
  });
});

describe('van inventory reconciliation', () => {
  const line: VanInventoryLine = {
    productId: 'P1', openingQty: 0, loadedQty: 100, transferInQty: 10, transferOutQty: 5,
    soldQty: 80, returnedInQty: 2, countedQty: 25, unitCost: 4,
  };
  it('computes expected qty + valued variance per SKU', () => {
    // expected = 0 + 100 + 10 - 5 - 80 + 2 = 27 ; counted 25 → variance -2 → value -8
    const r = reconcileVanLine(line);
    expect(r.expectedQty).toBe(27);
    expect(r.varianceQty).toBe(-2);
    expect(r.varianceValue).toBe(-8);
  });
  it('aggregates shortage/overage values', () => {
    const res = reconcileVanInventory([line, { productId: 'P2', openingQty: 0, loadedQty: 50, soldQty: 40, countedQty: 12, unitCost: 5 }]);
    // P2 expected = 10, counted 12 → +2 → +10
    expect(res.shortageValue).toBe(8);
    expect(res.overageValue).toBe(10);
    expect(res.totalVarianceValue).toBe(2);
  });
});

describe('route profitability', () => {
  it('computes gross/net + margins, absorbing shortage', () => {
    const r = routeProfitability({ sales: 10000, cogs: 6000, expenses: 500, returnCost: 300, inventoryShortage: 200 });
    expect(r.grossProfit).toBe(4000);
    expect(r.netProfit).toBe(3000);   // 4000 - 500 - 300 - 200
    expect(r.gpPct).toBe(40);
    expect(r.netProfitPct).toBe(30);
  });
});

describe('van statement assembly (the five reports)', () => {
  it('ties cash + inventory + P&L into one statement; P&L absorbs inv shortage', () => {
    const s = buildVanStatement({
      meta: { companyId: 'co', warehouseId: 'van1', salesmanId: 'S1', settlementDate: '2026-06-08' },
      openingCash: 500, openingStockValue: 4000,
      cash: { openingCash: 500, cashSales: 3000, cashCollections: 1000, cashReturns: 200, expenses: 300, countedCash: 3950 },
      inventory: [{ productId: 'P1', openingQty: 0, loadedQty: 100, soldQty: 80, countedQty: 18, unitCost: 4 }], // expected 20 → -2 → -8 shortage
      profit: { sales: 10000, cogs: 6000, expenses: 300, returnCost: 200 },
    });
    expect(s.cashReconciliation.status).toBe('shortage');
    expect(s.dayClose.cashVariance).toBe(-50);
    expect(s.inventoryReconciliation.shortageValue).toBe(8);
    expect(s.routeProfitability.inventoryShortage).toBe(8); // auto-absorbed from reconciliation
    expect(s.routeProfitability.netProfit).toBe(3492);       // 4000 - 300 - 200 - 8
  });
});
