/** ── Retail Execution — Survey engine (pure, no I/O) ───────────────────────
 *
 *  In-store surveys capture merchandising/visibility/availability at the shelf.
 *  A survey is a list of typed questions; a response is { questionKey: value }.
 *  Scored question types contribute (weighted) to a 0..100 score that feeds the
 *  Perfect Store score; unscored types (text/photo) count only toward completion.
 *
 *  Pattern adapted from Repsly/StayinFront/Pepperi/Salesforce CG Cloud in-store
 *  activities & surveys. Pure + testable.
 */

export type SurveyQuestionType = 'yesno' | 'rating' | 'number' | 'select' | 'text' | 'photo';

export interface SurveyOption { value: string; label?: string; labelAr?: string; score?: number }

export interface SurveyQuestion {
  key: string;
  label: string;
  labelAr?: string;
  type: SurveyQuestionType;
  weight?: number;        // default 1
  required?: boolean;
  options?: SurveyOption[]; // for 'select'
  max?: number;           // for 'rating'/'number' (denominator); default 5 for rating
}

export interface SurveyDef { questions: SurveyQuestion[] }
export type SurveyAnswers = Record<string, unknown>;

const SCORED: ReadonlySet<SurveyQuestionType> = new Set(['yesno', 'rating', 'number', 'select']);

function truthy(v: unknown): boolean {
  if (v === true) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'yes' || s === 'true' || s === '1' || s === 'y' || s === 'نعم';
}

/** Normalise one answer to a 0..1 score, or null when the type/answer is unscored. */
export function answerScore(q: SurveyQuestion, value: unknown): number | null {
  if (!SCORED.has(q.type)) return null;
  if (value === undefined || value === null || String(value).trim() === '') return null;
  switch (q.type) {
    case 'yesno':
      return truthy(value) ? 1 : 0;
    case 'rating': {
      const n = Number(value); const max = q.max && q.max > 0 ? q.max : 5;
      if (isNaN(n)) return null;
      return Math.max(0, Math.min(1, n / max));
    }
    case 'number': {
      // Scored only when a target/max is defined; otherwise it's data, not a score.
      if (!q.max || q.max <= 0) return null;
      const n = Number(value);
      if (isNaN(n)) return null;
      return Math.max(0, Math.min(1, n / q.max));
    }
    case 'select': {
      const opt = q.options?.find((o) => o.value === String(value));
      if (!opt) return 0;
      if (typeof opt.score === 'number') return Math.max(0, Math.min(1, opt.score));
      return 1; // a chosen option with no explicit score counts as satisfied
    }
    default:
      return null;
  }
}

function answered(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

export interface SurveyScore {
  /** Weighted 0..100 over scored+answered questions (100 when none scored). */
  score: number;
  scoredAnswered: number;
  requiredTotal: number;
  requiredAnswered: number;
  /** 0..100 share of required questions answered. */
  completionPct: number;
  complete: boolean;
}

/** Compute the weighted score + completion of a response against a survey def. */
export function scoreSurvey(def: SurveyDef, answers: SurveyAnswers): SurveyScore {
  let weightSum = 0, weightedScore = 0, scoredAnswered = 0;
  let requiredTotal = 0, requiredAnswered = 0;
  for (const q of def.questions) {
    const v = answers[q.key];
    if (q.required) { requiredTotal++; if (answered(v)) requiredAnswered++; }
    const s = answerScore(q, v);
    if (s !== null) {
      const w = q.weight && q.weight > 0 ? q.weight : 1;
      weightSum += w;
      weightedScore += w * s;
      scoredAnswered++;
    }
  }
  const score = weightSum === 0 ? 100 : Math.round((weightedScore / weightSum) * 100);
  const completionPct = requiredTotal === 0 ? 100 : Math.round((requiredAnswered / requiredTotal) * 100);
  return {
    score, scoredAnswered, requiredTotal, requiredAnswered, completionPct,
    complete: requiredAnswered >= requiredTotal,
  };
}

/** Validate a survey definition (used by the builder before save). */
export function validateSurvey(def: SurveyDef): string | null {
  if (!def.questions || def.questions.length === 0) return 'Add at least one question';
  const keys = new Set<string>();
  for (const q of def.questions) {
    if (!q.key || !q.key.trim()) return 'Every question needs a key';
    if (keys.has(q.key)) return `Duplicate question key: ${q.key}`;
    keys.add(q.key);
    if (!q.label || !q.label.trim()) return `Question "${q.key}" needs a label`;
    if (q.type === 'select' && (!q.options || q.options.length === 0)) return `Question "${q.key}" needs options`;
  }
  return null;
}
