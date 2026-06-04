/** ── Retail Execution — Perfect Store score (pure, no I/O) ─────────────────
 *
 *  "Perfect Store" rolls the execution pillars an outlet is measured on into one
 *  0..100 score: assortment (MSL compliance), in-store conditions (survey score),
 *  and price compliance. Any pillar with no data is dropped and the remaining
 *  weights are renormalised, so a score is always comparable.
 *
 *  This is the headline KPI of Pepperi/Repsly/StayinFront/BeatRoute/Salesforce CG
 *  Cloud "Perfect Store / Perfect Call" programs. Pure + testable.
 */

export interface PerfectStoreInputs {
  /** MSL compliance % (assortment.ts). */
  mslCompliancePct?: number | null;
  /** Survey score % (survey.ts). */
  surveyScorePct?: number | null;
  /** Price-compliance % (optional pillar). */
  priceCompliancePct?: number | null;
}

export interface PerfectStoreWeights { msl: number; survey: number; price: number }
export const DEFAULT_PS_WEIGHTS: PerfectStoreWeights = { msl: 0.5, survey: 0.3, price: 0.2 };

export interface PerfectStoreComponent { key: 'msl' | 'survey' | 'price'; pct: number; weight: number }
export interface PerfectStoreResult {
  score: number;                 // 0..100 (0 when no pillar has data)
  band: PerfectStoreBand;
  components: PerfectStoreComponent[];
  hasData: boolean;
}

export type PerfectStoreBand = 'gold' | 'silver' | 'bronze' | 'none';

/** Gold ≥90, Silver ≥75, Bronze ≥50, else none. */
export function perfectStoreBand(score: number, hasData = true): PerfectStoreBand {
  if (!hasData) return 'none';
  if (score >= 90) return 'gold';
  if (score >= 75) return 'silver';
  if (score >= 50) return 'bronze';
  return 'none';
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** The Perfect Store pillars (company-configurable; pillars with no data drop out
 *  and the rest renormalise). Default set mirrors the enterprise "Perfect Store"
 *  model: Availability, Assortment, Visibility, Pricing, Execution. */
export interface PerfectStorePillar { key: string; label?: string; pct: number | null; weight: number }
export interface PerfectStorePillarsResult {
  score: number;
  band: PerfectStoreBand;
  hasData: boolean;
  pillars: { key: string; label?: string; pct: number; weight: number }[];
}

/** Weighted score over an arbitrary, dynamic list of pillars. */
export function perfectStorePillars(pillars: readonly PerfectStorePillar[]): PerfectStorePillarsResult {
  const present = pillars
    .filter((p) => p.pct != null && p.weight > 0)
    .map((p) => ({ key: p.key, label: p.label, pct: clamp(p.pct as number), weight: p.weight }));
  const weightSum = present.reduce((s, p) => s + p.weight, 0);
  if (present.length === 0 || weightSum === 0) return { score: 0, band: 'none', hasData: false, pillars: present };
  const score = Math.round(present.reduce((s, p) => s + p.weight * p.pct, 0) / weightSum);
  return { score, band: perfectStoreBand(score, true), hasData: true, pillars: present };
}

/** Default 5-pillar weights for the Perfect Store Foundation (company-overridable). */
export const DEFAULT_PILLAR_WEIGHTS: Record<string, number> = {
  availability: 0.25, assortment: 0.3, visibility: 0.2, pricing: 0.15, execution: 0.1,
};

/** Weighted Perfect Store score over the pillars that have data. */
export function perfectStoreScore(
  inputs: PerfectStoreInputs,
  weights: PerfectStoreWeights = DEFAULT_PS_WEIGHTS,
): PerfectStoreResult {
  const present: PerfectStoreComponent[] = [];
  if (inputs.mslCompliancePct != null) present.push({ key: 'msl', pct: clamp(inputs.mslCompliancePct), weight: weights.msl });
  if (inputs.surveyScorePct != null) present.push({ key: 'survey', pct: clamp(inputs.surveyScorePct), weight: weights.survey });
  if (inputs.priceCompliancePct != null) present.push({ key: 'price', pct: clamp(inputs.priceCompliancePct), weight: weights.price });

  const weightSum = present.reduce((s, c) => s + c.weight, 0);
  if (present.length === 0 || weightSum === 0) {
    return { score: 0, band: 'none', components: present, hasData: false };
  }
  const score = Math.round(present.reduce((s, c) => s + c.weight * c.pct, 0) / weightSum);
  return { score, band: perfectStoreBand(score, true), components: present, hasData: true };
}
