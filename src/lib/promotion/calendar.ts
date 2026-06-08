// ============================================================================
// Promotion Platform — calendar + overlap detection (Phase 4+). Pure. Detects
// overlapping promotions (within the same scope) and lists active promotions on a
// date / window for the promotion calendar. No I/O.
// ============================================================================

export interface PromoWindow {
  id: string;
  startDate: string;   // ISO date
  endDate: string;     // ISO date
  scopeKey?: string;   // e.g. customer/channel/SKU key — overlaps only matter within a scope
}

/** True when two date windows overlap (inclusive). Pure. */
export function windowsOverlap(a: PromoWindow, b: PromoWindow): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

/** All overlapping promotion pairs within the same scope. Pure. */
export function detectOverlaps(promos: readonly PromoWindow[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < promos.length; i++) {
    for (let j = i + 1; j < promos.length; j++) {
      if ((promos[i].scopeKey ?? '') === (promos[j].scopeKey ?? '') && windowsOverlap(promos[i], promos[j])) {
        out.push([promos[i].id, promos[j].id]);
      }
    }
  }
  return out;
}

/** Promotions active on `date`. Pure. */
export function activeOn(promos: readonly PromoWindow[], date: string): PromoWindow[] {
  return promos.filter((p) => p.startDate <= date && date <= p.endDate);
}
