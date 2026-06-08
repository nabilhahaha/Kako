// ============================================================================
// Commercial Excellence — customer profitability engine (Phase 7). Pure. True
// profitability per customer: revenue (gross/net) minus the full cost stack
// (COGS, discounts, free goods, trade spend, visibility, listing, promotion,
// collection, return, near-expiry, incentives, commissions) → GP, net profit,
// margins, ROI, cost-to-serve, and per-customer/invoice/route profit. No I/O.
// ============================================================================

export interface ProfitabilityInput {
  grossSales: number;
  netSales: number;
  cogs: number;
  discounts: number;
  freeGoods: number;
  tradeSpend: number;
  visibilitySupport: number;
  listingFees: number;
  promotionCost: number;
  collectionCost: number;
  returnCost: number;
  nearExpiryCost: number;
  incentives: number;
  commissions: number;
  invoiceCount?: number;
  routeCount?: number;
}

export interface ProfitabilityResult {
  netSales: number;
  grossProfit: number;       // netSales − COGS
  totalCommercialCost: number;
  netProfit: number;         // grossProfit − commercial costs
  gpPct: number;
  netProfitPct: number;
  roi: number | null;        // netProfit / totalCommercialCost
  costToServe: number;       // all non-COGS commercial cost
  profitPerInvoice: number | null;
  profitPerRoute: number | null;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const pct = (a: number, b: number): number => (b > 0 ? round2((a / b) * 100) : 0);

/** Compute a customer P&L. Pure. */
export function customerProfitability(i: ProfitabilityInput): ProfitabilityResult {
  const grossProfit = round2(i.netSales - i.cogs);
  const costToServe = round2(
    i.discounts + i.freeGoods + i.tradeSpend + i.visibilitySupport + i.listingFees + i.promotionCost +
    i.collectionCost + i.returnCost + i.nearExpiryCost + i.incentives + i.commissions,
  );
  const netProfit = round2(grossProfit - costToServe);
  return {
    netSales: round2(i.netSales),
    grossProfit,
    totalCommercialCost: costToServe,
    netProfit,
    gpPct: pct(grossProfit, i.netSales),
    netProfitPct: pct(netProfit, i.netSales),
    roi: costToServe > 0 ? round2(netProfit / costToServe) : null,
    costToServe,
    profitPerInvoice: i.invoiceCount && i.invoiceCount > 0 ? round2(netProfit / i.invoiceCount) : null,
    profitPerRoute: i.routeCount && i.routeCount > 0 ? round2(netProfit / i.routeCount) : null,
  };
}

export interface CustomerPnL extends ProfitabilityResult { customerId: string }

/** Rank customers by net profit (contribution analysis: top + worst). Pure. */
export function rankByProfit(rows: readonly CustomerPnL[]): { top: CustomerPnL[]; worst: CustomerPnL[] } {
  const sorted = [...rows].sort((a, b) => b.netProfit - a.netProfit);
  return { top: sorted.slice(0, 10), worst: [...sorted].reverse().slice(0, 10) };
}
