// ============================================================================
// Route Accounting — route profitability (Phase 7A). Pure. Route/van/day P&L:
// revenue − COGS − route expenses − return cost (− inventory shortage) → gross /
// net profit + margins. Reuses the customer-profitability shape at route grain.
// No I/O.
// ============================================================================

export interface RouteProfitInput {
  sales: number;            // net sales delivered on the route
  cogs: number;
  expenses: number;         // route/van expenses (fuel, per-diem, …)
  returnCost: number;       // value of returns (credit issued)
  inventoryShortage?: number; // valued inventory shortage from reconciliation
}

export interface RouteProfitResult {
  revenue: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  returnCost: number;
  inventoryShortage: number;
  netProfit: number;
  gpPct: number;
  netProfitPct: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const pct = (a: number, b: number): number => (b > 0 ? round2((a / b) * 100) : 0);

/** Compute route/van/day profitability. Pure. */
export function routeProfitability(i: RouteProfitInput): RouteProfitResult {
  const grossProfit = round2(i.sales - i.cogs);
  const inventoryShortage = round2(i.inventoryShortage ?? 0);
  const netProfit = round2(grossProfit - i.expenses - i.returnCost - inventoryShortage);
  return {
    revenue: round2(i.sales),
    cogs: round2(i.cogs),
    grossProfit,
    expenses: round2(i.expenses),
    returnCost: round2(i.returnCost),
    inventoryShortage,
    netProfit,
    gpPct: pct(grossProfit, i.sales),
    netProfitPct: pct(netProfit, i.sales),
  };
}
