// ============================================================================
// Visit-Frequency Resolution Layer (FR-1). Pure, no I/O. The single authority
// that decides a customer's effective visit frequency from the approved
// precedence:
//
//   1. Customer-level frequency (manual or imported)  ← primary source of truth
//   2. Route / planning assignment
//   3. Classification recommendation (A/B/C)
//   4. System default
//
// Classification is a RECOMMENDATION, never the default authority: it only wins
// when nothing higher exists — UNLESS a company explicitly opts in via
// `policy.classificationCanOverride`. The classification value is always
// returned as `recommendation` so the UI can show "recommended vs actual" and
// offer opt-in auto-fill. Industry-agnostic: levels are just data.
// ============================================================================
import type { VisitFrequency } from './visit-frequency';
import { frequencyFromVisitsPerWeek } from './visit-frequency';
import { visitsPerWeekFor, type FrequencyRule } from './frequency';

/** Provenance of the resolved frequency. */
export type FrequencySource = 'manual' | 'import' | 'planning' | 'classification' | 'system';

export interface FrequencyResolveInput {
  /** #1 — customer-level value (manual or imported). Primary authority. */
  customer?: VisitFrequency | null;
  /** Which customer-level provenance to report when `customer` wins. */
  customerSource?: 'manual' | 'import';
  /** #2 — route / planning assignment. */
  planning?: VisitFrequency | null;
  /** #3 — classification recommendation (A/B/C → frequency). */
  classification?: VisitFrequency | null;
  /** #4 — system default. */
  system?: VisitFrequency | null;
  /** Company policy. `classificationCanOverride` lets #3 supersede #1/#2 when
   *  explicitly enabled. Defaults to false (customer-level stays authoritative). */
  policy?: { classificationCanOverride?: boolean };
}

export interface ResolvedFrequency {
  /** The effective frequency, or null when nothing is configured at any level. */
  frequency: VisitFrequency | null;
  /** Provenance of `frequency`. `'system'` when nothing resolved. */
  source: FrequencySource;
  /** The classification recommendation (level #3), always surfaced for the UI. */
  recommendation: VisitFrequency | null;
}

/**
 * Resolve the effective visit frequency by precedence. Pure, deterministic.
 */
export function resolveVisitFrequency(input: FrequencyResolveInput): ResolvedFrequency {
  const recommendation = input.classification ?? null;
  const override = input.policy?.classificationCanOverride === true;

  // Explicit company opt-in: classification supersedes customer/planning.
  if (override && recommendation) {
    return { frequency: recommendation, source: 'classification', recommendation };
  }

  // Standard precedence: customer → planning → classification → system.
  if (input.customer) {
    return { frequency: input.customer, source: input.customerSource ?? 'manual', recommendation };
  }
  if (input.planning) {
    return { frequency: input.planning, source: 'planning', recommendation };
  }
  if (recommendation) {
    return { frequency: recommendation, source: 'classification', recommendation };
  }
  if (input.system) {
    return { frequency: input.system, source: 'system', recommendation };
  }
  return { frequency: null, source: 'system', recommendation };
}

/**
 * Bridge the existing classification rules into a level-#3 VisitFrequency:
 * `classification → visits/week (rules) → VisitFrequency`. Reuses
 * `visitsPerWeekFor` so the classification path stays identical. Returns null
 * when no rule matches the classification. Pure.
 */
export function classificationFrequency(
  rules: readonly FrequencyRule[],
  classification: string,
): VisitFrequency | null {
  const vpw = visitsPerWeekFor(rules, classification);
  return vpw == null ? null : frequencyFromVisitsPerWeek(vpw);
}
