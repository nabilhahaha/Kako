// ============================================================================
// Returns — analytics read-models (Phase 4+). Pure rollups for return analytics
// (rate/value/quantity by customer/SKU/brand/salesman/route/region/reason) and
// near-expiry analytics (recovery %, recovery/disposal value, risk customers).
// Raw-data-export friendly. No I/O.
// ============================================================================

export interface ReturnRecord {
  returnId: string;
  customerId: string;
  productId: string;
  brand?: string | null;
  salesmanId?: string | null;
  routeId?: string | null;
  regionId?: string | null;
  reason: string;
  returnedQty: number;
  returnValue: number;
  netReturnValue: number;
  nearExpiry?: boolean;
  recovered?: boolean;       // recovered (resold/credited) vs disposed
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

type Key = 'customerId' | 'productId' | 'brand' | 'salesmanId' | 'routeId' | 'regionId' | 'reason';

/** Group return value + qty by a dimension (desc by value). Pure. */
export function returnsBy(records: readonly ReturnRecord[], key: Key): { key: string; value: number; qty: number; count: number }[] {
  const acc = new Map<string, { value: number; qty: number; count: number }>();
  for (const r of records) {
    const k = String((r as unknown as Record<string, unknown>)[key] ?? 'unknown');
    const g = acc.get(k) ?? { value: 0, qty: 0, count: 0 };
    g.value += r.returnValue; g.qty += r.returnedQty; g.count += 1;
    acc.set(k, g);
  }
  return [...acc.entries()].map(([k, g]) => ({ key: k, value: round2(g.value), qty: g.qty, count: g.count })).sort((a, b) => b.value - a.value);
}

/** Return rate % = return value / gross sales × 100. Pure. */
export function returnRatePct(returnValue: number, grossSales: number): number {
  return grossSales > 0 ? round2((returnValue / grossSales) * 100) : 0;
}

export interface NearExpiryAnalytics {
  nearExpiryReturns: number;
  nearExpiryValue: number;
  recoveryValue: number;
  disposalValue: number;
  recoveryPct: number;
  riskCustomers: { customerId: string; value: number }[];
}

/** Near-expiry recovery analytics. Pure. */
export function nearExpiryAnalytics(records: readonly ReturnRecord[]): NearExpiryAnalytics {
  const ne = records.filter((r) => r.nearExpiry);
  const recoveryValue = round2(ne.filter((r) => r.recovered).reduce((s, r) => s + r.returnValue, 0));
  const disposalValue = round2(ne.filter((r) => !r.recovered).reduce((s, r) => s + r.returnValue, 0));
  const total = round2(recoveryValue + disposalValue);
  return {
    nearExpiryReturns: ne.length,
    nearExpiryValue: total,
    recoveryValue,
    disposalValue,
    recoveryPct: total > 0 ? round2((recoveryValue / total) * 100) : 0,
    riskCustomers: returnsBy(ne, 'customerId').map((x) => ({ customerId: x.key, value: x.value })).slice(0, 10),
  };
}
