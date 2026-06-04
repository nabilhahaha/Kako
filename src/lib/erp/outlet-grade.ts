/** ── FMCG Outlet Grading — dynamic grade engine (pure, no I/O) ─────────────
 *
 *  Scores each outlet on company-weighted factors and assigns a COMPANY-DEFINED
 *  grade band. NOTHING is hardcoded: grade codes (A+/A/B/C/D or any custom set),
 *  their score thresholds, and the factor weights are all company master data —
 *  add/rename/reweight with zero code change. Serves any industry pack.
 *
 *  Factors (all normalised to 0..100): sales value, sales quantity, visit
 *  frequency, MSL compliance, distribution %, Perfect Store %, collection. Raw
 *  factors (value/quantity/visits) are normalised relative to the cohort; the
 *  already-percentage factors pass through. Weighted score → grade band by
 *  threshold; movement vs the prior grade drives upgrade/downgrade alerts.
 *
 *  Pattern adapted from Pepperi/Repsly/StayinFront/BeatRoute/Salesforce CG Cloud
 *  outlet segmentation & scoring. Pure + fully testable.
 */

export type GradeFactorKey =
  | 'sales_value' | 'sales_quantity' | 'visit_frequency'
  | 'msl_compliance' | 'distribution' | 'perfect_store' | 'collection';

/** Factors already expressed as a 0..100 percentage (pass through, no rescaling). */
export const PERCENT_FACTORS: ReadonlySet<string> = new Set(['msl_compliance', 'distribution', 'perfect_store', 'collection']);

export interface GradeBand {
  id: string;
  code: string;       // 'A+', 'A', … or any company code
  label: string;
  minScore: number;   // inclusive lower bound (0..100)
  rank: number;       // higher = better grade
}

export interface FactorWeight { factor: string; weight: number }

/** Min-max normalise raw cohort values to 0..100 (relative ranking). When all
 *  values are equal, non-zero → 100, zero → 0. */
export function normalizeMinMax(values: ReadonlyMap<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  if (values.size === 0) return out;
  let min = Infinity, max = -Infinity;
  for (const v of values.values()) { if (v < min) min = v; if (v > max) max = v; }
  const range = max - min;
  for (const [id, v] of values) {
    out.set(id, range === 0 ? (max > 0 ? 100 : 0) : Math.round(((v - min) / range) * 100));
  }
  return out;
}

/** Weighted 0..100 score over the factors that have a value (weights renormalise
 *  over present factors). Each factor value must already be 0..100. */
export function scoreOutlet(
  factors: Readonly<Record<string, number | null | undefined>>,
  weights: readonly FactorWeight[],
): number {
  let wSum = 0, acc = 0;
  for (const { factor, weight } of weights) {
    if (weight <= 0) continue;
    const v = factors[factor];
    if (v == null || isNaN(v)) continue;
    wSum += weight;
    acc += weight * Math.max(0, Math.min(100, v));
  }
  return wSum === 0 ? 0 : Math.round(acc / wSum);
}

/** Assign the highest-threshold band whose minScore ≤ score. Null when no band
 *  qualifies (score below the lowest band). */
export function assignGrade(score: number, bands: readonly GradeBand[]): GradeBand | null {
  const sorted = [...bands].sort((a, b) => b.minScore - a.minScore);
  for (const b of sorted) if (score >= b.minScore) return b;
  return null;
}

export type GradeMovement = 'upgrade' | 'downgrade' | 'same' | 'new';

/** Compare a new grade rank to the previous one (drives upgrade/downgrade alerts). */
export function gradeMovement(prevRank: number | null | undefined, newRank: number): GradeMovement {
  if (prevRank == null) return 'new';
  if (newRank > prevRank) return 'upgrade';
  if (newRank < prevRank) return 'downgrade';
  return 'same';
}

export interface GradedOutlet {
  customerId: string;
  score: number;
  grade: GradeBand | null;
  movement: GradeMovement;
}

/** Grade a whole cohort: normalise raw factors, score, assign band, detect
 *  movement vs each outlet's previous grade rank. `rawFactors` carries the raw
 *  (un-normalised) value/quantity/visit numbers; `pctFactors` the 0..100 ones. */
export function gradeCohort(input: {
  customerIds: readonly string[];
  rawFactors: Readonly<Record<string, ReadonlyMap<string, number>>>; // factorKey → (customerId → raw)
  pctFactors: Readonly<Record<string, ReadonlyMap<string, number>>>; // factorKey → (customerId → 0..100)
  weights: readonly FactorWeight[];
  bands: readonly GradeBand[];
  prevRankByCustomer?: ReadonlyMap<string, number>;
}): GradedOutlet[] {
  // Normalise each raw factor across the cohort once.
  const normalised: Record<string, Map<string, number>> = {};
  for (const [factor, map] of Object.entries(input.rawFactors)) normalised[factor] = normalizeMinMax(map);

  return input.customerIds.map((customerId) => {
    const factors: Record<string, number> = {};
    for (const [factor, map] of Object.entries(normalised)) { const v = map.get(customerId); if (v != null) factors[factor] = v; }
    for (const [factor, map] of Object.entries(input.pctFactors)) { const v = map.get(customerId); if (v != null) factors[factor] = v; }
    const score = scoreOutlet(factors, input.weights);
    const grade = assignGrade(score, input.bands);
    const movement = gradeMovement(input.prevRankByCustomer?.get(customerId) ?? null, grade?.rank ?? 0);
    return { customerId, score, grade, movement };
  });
}

/** Default 7-factor weights (company-overridable; sums need not be 1 — they
 *  renormalise). */
export const DEFAULT_GRADE_WEIGHTS: FactorWeight[] = [
  { factor: 'sales_value', weight: 0.30 },
  { factor: 'sales_quantity', weight: 0.10 },
  { factor: 'visit_frequency', weight: 0.10 },
  { factor: 'msl_compliance', weight: 0.15 },
  { factor: 'distribution', weight: 0.15 },
  { factor: 'perfect_store', weight: 0.10 },
  { factor: 'collection', weight: 0.10 },
];

/** Default A+/A/B/C/D bands (seed only — fully company-editable, never hardcoded
 *  in logic; the engine reads whatever bands the company defines). */
export const DEFAULT_GRADE_BANDS: Omit<GradeBand, 'id'>[] = [
  { code: 'A+', label: 'A+', minScore: 85, rank: 5 },
  { code: 'A', label: 'A', minScore: 70, rank: 4 },
  { code: 'B', label: 'B', minScore: 55, rank: 3 },
  { code: 'C', label: 'C', minScore: 40, rank: 2 },
  { code: 'D', label: 'D', minScore: 0, rank: 1 },
];
