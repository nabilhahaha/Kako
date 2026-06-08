import { describe, it, expect } from 'vitest';
import {
  COMMERCIAL_ENABLED,
  resolvePrice, applyRule, DEFAULT_PRICE_PRIORITY, type PriceRule, type PriceContext,
  agingBuckets, availableCredit, customerRiskScore, checkOrderCredit, DEFAULT_CREDIT_BLOCK_POLICY,
  customerProfitability, rankByProfit, type CustomerPnL,
} from './index';

describe('commercial/flags', () => {
  it('defaults OFF', () => {
    const prev = process.env.KAKO_COMMERCIAL;
    delete process.env.KAKO_COMMERCIAL;
    expect(COMMERCIAL_ENABLED()).toBe(false);
    process.env.KAKO_COMMERCIAL = '1';
    expect(COMMERCIAL_ENABLED()).toBe(true);
    if (prev === undefined) delete process.env.KAKO_COMMERCIAL; else process.env.KAKO_COMMERCIAL = prev;
  });
});

describe('pricing engine (configurable priority + rules + validity)', () => {
  const ctx: PriceContext = { productId: 'P1', basePrice: 100, quantity: 12, asOf: '2026-06-08' };
  const rules: PriceRule[] = [
    { id: 'r-std', source: 'standard', productId: 'P1', kind: 'fixed_price', price: 100 },
    { id: 'r-chan', source: 'channel', productId: 'P1', kind: 'percentage_discount', discountPct: 5 },
    { id: 'r-cust', source: 'customer', productId: 'P1', kind: 'fixed_price', price: 90 },
    { id: 'r-contract', source: 'contract', productId: 'P1', kind: 'fixed_price', price: 85, effectiveFrom: '2026-06-01', effectiveTo: '2026-06-30' },
  ];

  it('resolves by priority: contract beats customer beats channel beats standard', () => {
    expect(resolvePrice(rules, ctx).unitPrice).toBe(85);          // contract wins
    expect(resolvePrice(rules.filter((r) => r.source !== 'contract'), ctx).unitPrice).toBe(90); // customer
    expect(resolvePrice([rules[0], rules[1]], ctx).unitPrice).toBe(95); // channel 5% off 100
  });

  it('honours validity windows + quantity breaks', () => {
    const expired = resolvePrice(rules, { ...ctx, asOf: '2026-07-15' });
    expect(expired.unitPrice).toBe(90);   // contract expired → customer
    const qty = applyRule({ id: 'q', source: 'customer', productId: 'P1', kind: 'quantity_break', breaks: [{ min: 10, price: 80 }, { min: 50, price: 70 }] }, ctx);
    expect(qty).toBe(80);
  });

  it('falls back to base when no rule matches', () => {
    expect(resolvePrice([], ctx)).toEqual({ unitPrice: 100, source: 'standard', ruleId: null });
    expect(DEFAULT_PRICE_PRIORITY[0]).toBe('contract');
  });
});

describe('credit engine', () => {
  it('ages invoices into buckets', () => {
    const b = agingBuckets([{ amount: 100, daysOverdue: 0 }, { amount: 50, daysOverdue: 45 }, { amount: 30, daysOverdue: 200 }]);
    expect(b.current).toBe(100);
    expect(b.d31_60).toBe(50);
    expect(b.d180_plus).toBe(30);
  });
  it('available credit + risk + order blocking', () => {
    expect(availableCredit({ creditLimit: 10000, usedCredit: 7000 })).toBe(3000);
    expect(customerRiskScore({ overdueAmount: 5000, outstandingAmount: 10000, creditLimit: 10000, daysSinceLastPayment: 90 })).toBeGreaterThan(60);
    const dec = checkOrderCredit({ orderAmount: 5000, credit: { creditLimit: 10000, usedCredit: 7000 }, overdueAmount: 1000, riskScore: 80 }, DEFAULT_CREDIT_BLOCK_POLICY);
    expect(dec.triggered).toContain('credit_limit_exceeded'); // 7000+5000 > 10000
    expect(dec.mode).toBe('hard_block');                       // most restrictive
  });
  it('clean order → no block', () => {
    expect(checkOrderCredit({ orderAmount: 1000, credit: { creditLimit: 10000, usedCredit: 2000 }, overdueAmount: 0, riskScore: 10 }).mode).toBe('none');
  });
});

describe('profitability engine', () => {
  it('computes P&L, cost-to-serve, margins, ROI', () => {
    const r = customerProfitability({
      grossSales: 11000, netSales: 10000, cogs: 6000, discounts: 1000, freeGoods: 200, tradeSpend: 500,
      visibilitySupport: 100, listingFees: 100, promotionCost: 300, collectionCost: 50, returnCost: 150,
      nearExpiryCost: 100, incentives: 200, commissions: 100, invoiceCount: 10, routeCount: 2,
    });
    expect(r.grossProfit).toBe(4000);              // 10000 - 6000
    expect(r.costToServe).toBe(2800);              // sum of commercial costs
    expect(r.netProfit).toBe(1200);                // 4000 - 2800
    expect(r.gpPct).toBe(40);
    expect(r.profitPerInvoice).toBe(120);
    expect(r.profitPerRoute).toBe(600);
  });
  it('ranks customers top + worst', () => {
    const rows: CustomerPnL[] = [
      { customerId: 'A', netProfit: 500 } as CustomerPnL,
      { customerId: 'B', netProfit: -200 } as CustomerPnL,
      { customerId: 'C', netProfit: 900 } as CustomerPnL,
    ];
    const r = rankByProfit(rows);
    expect(r.top[0].customerId).toBe('C');
    expect(r.worst[0].customerId).toBe('B');
  });
});
