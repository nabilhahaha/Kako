/** ── Retail Execution — Assortment compliance maths (pure, no I/O) ─────────
 *
 *  Given the products an outlet *should* carry (its resolved MSL — see
 *  msl-matrix.ts, which is fully company-configurable) vs the products it actually
 *  has, compute compliance. The same primitive yields two FMCG KPIs:
 *    • Distribution gap — required products the outlet has NOT bought (sold set).
 *    • Out-of-stock (OOS) — required products NOT currently available (stock set).
 *  Weighted compliance honours each SKU's MSL weight (core SKUs hurt more).
 *
 *  Dimension-agnostic by design: this module never names a channel/class/level —
 *  it consumes resolved product sets/weights from the dynamic matrix engine.
 *  Pattern: Pepperi/Repsly/StayinFront/BeatRoute/Salesforce CG Cloud retail
 *  execution. Pure + fully testable.
 */

export interface OutletCompliance {
  customerId: string;
  required: number;
  present: number;
  missing: number;
  /** 0..100; 100 when nothing is required for this outlet. */
  compliancePct: number;
  missingProductIds: string[];
}

/**
 * Compliance of one outlet: of its required (MSL) products, how many are in the
 * `present` set. Use the outlet's SOLD products for distribution gap, or its
 * AVAILABLE (stock) products for OOS — same maths, different input set.
 */
export function outletCompliance(
  customerId: string,
  requiredIds: ReadonlySet<string>,
  presentIds: ReadonlySet<string>,
): OutletCompliance {
  const missingProductIds: string[] = [];
  let present = 0;
  for (const id of requiredIds) {
    if (presentIds.has(id)) present++;
    else missingProductIds.push(id);
  }
  const required = requiredIds.size;
  const compliancePct = required === 0 ? 100 : Math.round((present / required) * 100);
  return { customerId, required, present, missing: missingProductIds.length, compliancePct, missingProductIds };
}

export interface WeightedOutletCompliance extends OutletCompliance {
  /** Σ weight(present) / Σ weight(required) × 100; weights from the MSL level. */
  weightedPct: number;
}

/** Weighted compliance: each required SKU carries its MSL weight, so missing a
 *  core SKU costs more than missing an extended one. Falls back to the count-based
 *  `compliancePct` for the headline; `weightedPct` is the scored figure. */
export function weightedOutletCompliance(
  customerId: string,
  requiredWeights: ReadonlyMap<string, number>,
  presentIds: ReadonlySet<string>,
): WeightedOutletCompliance {
  const requiredIds = new Set(requiredWeights.keys());
  const base = outletCompliance(customerId, requiredIds, presentIds);
  let weightTotal = 0, weightPresent = 0;
  for (const [id, w] of requiredWeights) {
    const ww = Math.max(0, w);
    weightTotal += ww;
    if (presentIds.has(id)) weightPresent += ww;
  }
  const weightedPct = weightTotal === 0 ? 100 : Math.round((weightPresent / weightTotal) * 100);
  return { ...base, weightedPct };
}

export interface AssortmentSummary {
  outlets: number;
  totalRequired: number;
  totalPresent: number;
  /** present / required across all outlets (the headline MSL compliance %). */
  compliancePct: number;
  fullyCompliantOutlets: number;
  /** total missing required lines across all outlets (distribution gaps / OOS). */
  gapLines: number;
}

/** Roll up per-outlet compliance into a portfolio summary. */
export function summarizeCompliance(rows: readonly OutletCompliance[]): AssortmentSummary {
  let totalRequired = 0, totalPresent = 0, fullyCompliantOutlets = 0, gapLines = 0;
  let outletsWithMsl = 0;
  for (const r of rows) {
    totalRequired += r.required;
    totalPresent += r.present;
    gapLines += r.missing;
    if (r.required > 0) {
      outletsWithMsl++;
      if (r.missing === 0) fullyCompliantOutlets++;
    }
  }
  const compliancePct = totalRequired === 0 ? 100 : Math.round((totalPresent / totalRequired) * 100);
  return {
    outlets: outletsWithMsl,
    totalRequired,
    totalPresent,
    compliancePct,
    fullyCompliantOutlets,
    gapLines,
  };
}

/** Health band for an MSL/availability compliance % (drives card tone). */
export function complianceBand(pct: number): 'good' | 'attention' | 'critical' {
  if (pct >= 90) return 'good';
  if (pct >= 70) return 'attention';
  return 'critical';
}
