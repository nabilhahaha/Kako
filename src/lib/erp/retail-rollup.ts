/** ── Executive Retail Execution — dynamic-dimension rollup engine (pure) ────
 *
 *  Aggregates per-outlet retail-execution metrics by ANY dimension. The dimension
 *  is an opaque key into each outlet's `dims` bag (region / area / supervisor /
 *  salesman / customer / channel / sub-channel / class / … — whatever the company
 *  defined). NOTHING here names a channel or class, so new dimensions roll up with
 *  zero code change. SKU/brand axes roll up per product.
 *
 *  Powers the MSL Compliance, Distribution, OOS, Perfect Store and Cockpit
 *  dashboards — the same primitive every retail-execution suite exposes
 *  (Pepperi BI, Repsly dashboards, StayinFront EDGE, BeatRoute scorecards,
 *  Salesforce CG Cloud analytics). Pure + fully testable.
 */

export interface DimValue { id: string | null; label: string }

export interface OutletMetric {
  customerId: string;
  name: string;
  /** dimensionKey → the outlet's value for it (label + id). Fully dynamic. */
  dims: Record<string, DimValue>;
  required: number;
  present: number;
  gap: number;
  weightRequired: number;
  weightPresent: number;
  missingProductIds: string[];
  /** The outlet's full resolved MSL product ids (for SKU/brand-axis compliance). */
  requiredProductIds?: string[];
  /** Products the outlet sold in the window (for distribution / active checks). */
  soldCount: number;
  /** Commercial weight (period turnover) for weighted KPIs. */
  value: number;
  surveyScorePct: number | null;
  hasMsl: boolean;
}

export interface RollupRow {
  key: string;
  label: string;
  outlets: number;
  required: number;
  present: number;
  gapLines: number;
  compliancePct: number;   // present / required
  weightedPct: number;     // weightPresent / weightRequired
  fullyCompliant: number;
}

const pct = (num: number, den: number) => (den === 0 ? 100 : Math.round((num / den) * 100));

/** Roll up outlet metrics by one dynamic dimension; weakest compliance first. */
export function rollupByDimension(metrics: readonly OutletMetric[], dimKey: string): RollupRow[] {
  const groups = new Map<string, { label: string; rows: OutletMetric[] }>();
  for (const m of metrics) {
    if (!m.hasMsl) continue;
    const dv = m.dims[dimKey];
    const id = dv?.id ?? '__none__';
    const label = dv?.label ?? '—';
    (groups.get(id) ?? groups.set(id, { label, rows: [] }).get(id)!).rows.push(m);
  }
  const out: RollupRow[] = [];
  for (const [key, g] of groups) {
    let required = 0, present = 0, gapLines = 0, wReq = 0, wPres = 0, fully = 0;
    for (const m of g.rows) {
      required += m.required; present += m.present; gapLines += m.gap;
      wReq += m.weightRequired; wPres += m.weightPresent;
      if (m.gap === 0) fully++;
    }
    out.push({
      key, label: g.label, outlets: g.rows.length,
      required, present, gapLines,
      compliancePct: pct(present, required), weightedPct: pct(wPres, wReq),
      fullyCompliant: fully,
    });
  }
  return out.sort((a, b) => a.weightedPct - b.weightedPct || b.gapLines - a.gapLines);
}

export interface OutletMetricsSummary {
  outlets: number;            // outlets with an MSL
  activeCustomers: number;    // outlets that sold ≥1 SKU in the window
  compliancePct: number;
  weightedPct: number;
  gapLines: number;
  fullyCompliant: number;
  oosPct: number;             // gap / required (share of mandatory lines not present)
}

/** Portfolio totals (the cockpit/headline figures). */
export function summarizeOutletMetrics(metrics: readonly OutletMetric[]): OutletMetricsSummary {
  let outlets = 0, active = 0, required = 0, present = 0, gapLines = 0, wReq = 0, wPres = 0, fully = 0;
  for (const m of metrics) {
    if (m.soldCount > 0) active++;
    if (!m.hasMsl) continue;
    outlets++;
    required += m.required; present += m.present; gapLines += m.gap;
    wReq += m.weightRequired; wPres += m.weightPresent;
    if (m.gap === 0) fully++;
  }
  return {
    outlets, activeCustomers: active,
    compliancePct: pct(present, required), weightedPct: pct(wPres, wReq),
    gapLines, fullyCompliant: fully,
    oosPct: required === 0 ? 0 : Math.round((gapLines / required) * 100),
  };
}

export interface MissingSku { productId: string; count: number }

/** Most-frequently-missing mandatory SKUs across outlets (OOS "top missing"). */
export function topMissingSkus(metrics: readonly OutletMetric[], limit = 10): MissingSku[] {
  const counts = new Map<string, number>();
  for (const m of metrics) for (const pid of m.missingProductIds) counts.set(pid, (counts.get(pid) ?? 0) + 1);
  return [...counts.entries()]
    .map(([productId, count]) => ({ productId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export interface ProductCompliance { productId: string; requiredOutlets: number; presentOutlets: number; compliancePct: number }

/** SKU-axis compliance: per product, in how many outlets it's required vs present.
 *  weakest first — the SKUs losing the most distribution. */
export function skuCompliance(metrics: readonly OutletMetric[], limit = 0): ProductCompliance[] {
  const required = new Map<string, number>();
  const missing = new Map<string, number>();
  for (const m of metrics) {
    for (const pid of (m.requiredProductIds ?? [])) required.set(pid, (required.get(pid) ?? 0) + 1);
    for (const pid of m.missingProductIds) missing.set(pid, (missing.get(pid) ?? 0) + 1);
  }
  const rows = [...required.entries()].map(([productId, reqN]) => {
    const miss = missing.get(productId) ?? 0;
    const presentOutlets = reqN - miss;
    return { productId, requiredOutlets: reqN, presentOutlets, compliancePct: pct(presentOutlets, reqN) };
  }).sort((a, b) => a.compliancePct - b.compliancePct || b.requiredOutlets - a.requiredOutlets);
  return limit > 0 ? rows.slice(0, limit) : rows;
}

/** Brand-axis compliance: SKU compliance grouped by each product's brand. */
export function brandCompliance(metrics: readonly OutletMetric[], brandOf: ReadonlyMap<string, string>): RollupRow[] {
  const skus = skuCompliance(metrics);
  const byBrand = new Map<string, { required: number; present: number; skus: number }>();
  for (const s of skus) {
    const brand = brandOf.get(s.productId) ?? '—';
    const b = byBrand.get(brand) ?? { required: 0, present: 0, skus: 0 };
    b.required += s.requiredOutlets; b.present += s.presentOutlets; b.skus++;
    byBrand.set(brand, b);
  }
  return [...byBrand.entries()].map(([brand, b]) => ({
    key: brand, label: brand, outlets: b.skus,
    required: b.required, present: b.present, gapLines: b.required - b.present,
    compliancePct: pct(b.present, b.required), weightedPct: pct(b.present, b.required),
    fullyCompliant: 0,
  })).sort((a, b) => a.compliancePct - b.compliancePct);
}

/** The dynamic set of dimension keys present across the metrics (for drill tabs). */
export function availableDimensions(metrics: readonly OutletMetric[]): string[] {
  const keys = new Set<string>();
  for (const m of metrics) for (const k of Object.keys(m.dims)) keys.add(k);
  return [...keys];
}
