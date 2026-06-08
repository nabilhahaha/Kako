// ============================================================================
// Suggested Load — load sheet + replenishment + van utilization (Phase 7E). Pure.
// Given projected demand + current van stock + a safety buffer, computes the
// suggested load per SKU (whole units), the replenishment recommendations, and
// van utilization vs capacity (units/weight/volume). No I/O.
// ============================================================================

export interface SuggestedLoadLineInput {
  productId: string;
  projectedDemand: number;
  currentVanStock: number;
  safetyPct?: number;              // buffer over demand (default 10%)
}

export interface SuggestedLoadLine {
  productId: string;
  projectedDemand: number;
  currentVanStock: number;
  targetStock: number;
  suggestedLoad: number;           // whole units to load (>= 0)
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Suggested load for one SKU: ceil(demand×(1+buffer) − on-van), floored at 0. Pure. */
export function suggestLoadLine(i: SuggestedLoadLineInput): SuggestedLoadLine {
  const targetStock = round2(i.projectedDemand * (1 + (i.safetyPct ?? 10) / 100));
  const suggestedLoad = Math.max(0, Math.ceil(targetStock - i.currentVanStock));
  return { productId: i.productId, projectedDemand: round2(i.projectedDemand), currentVanStock: i.currentVanStock, targetStock, suggestedLoad };
}

export interface SuggestedLoad {
  lines: SuggestedLoadLine[];
  totalSuggestedUnits: number;
}

/** Build the suggested load sheet. Pure. */
export function suggestLoad(inputs: readonly SuggestedLoadLineInput[]): SuggestedLoad {
  const lines = inputs.map(suggestLoadLine);
  return { lines, totalSuggestedUnits: lines.reduce((s, l) => s + l.suggestedLoad, 0) };
}

/** Replenishment recommendations — only SKUs needing load, biggest gaps first. Pure. */
export function replenishmentRecommendations(load: SuggestedLoad): SuggestedLoadLine[] {
  return load.lines.filter((l) => l.suggestedLoad > 0).sort((a, b) => b.suggestedLoad - a.suggestedLoad);
}

// ── Van utilization ────────────────────────────────────────────────────────
export interface VanCapacity { units?: number; weightKg?: number; volumeM3?: number }
export interface LoadItem { productId: string; qty: number; unitWeightKg?: number; unitVolumeM3?: number }

export interface VanUtilization {
  units: number;
  weightKg: number;
  volumeM3: number;
  unitsPct: number | null;
  weightPct: number | null;
  volumePct: number | null;
  withinCapacity: boolean;
}

const pct = (a: number, b?: number): number | null => (b && b > 0 ? round2((a / b) * 100) : null);

/** Van utilization vs capacity across units/weight/volume. Pure. */
export function vanUtilization(items: readonly LoadItem[], capacity: VanCapacity): VanUtilization {
  const units = items.reduce((s, i) => s + i.qty, 0);
  const weightKg = round2(items.reduce((s, i) => s + i.qty * (i.unitWeightKg ?? 0), 0));
  const volumeM3 = round2(items.reduce((s, i) => s + i.qty * (i.unitVolumeM3 ?? 0), 0));
  const unitsPct = pct(units, capacity.units);
  const weightPct = pct(weightKg, capacity.weightKg);
  const volumePct = pct(volumeM3, capacity.volumeM3);
  const withinCapacity = [unitsPct, weightPct, volumePct].every((p) => p == null || p <= 100);
  return { units, weightKg, volumeM3, unitsPct, weightPct, volumePct, withinCapacity };
}
