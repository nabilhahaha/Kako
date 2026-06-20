/**
 * Shared planning engine — Expected Visit Duration. Pure, no I/O. Resolves how long
 * a visit takes, by precedence, so a supervisor can plan immediately with nothing but
 * a global default and richer data simply overrides upward:
 *
 *   1. Customer-specific duration
 *   2. Channel duration
 *   3. Class (grade) duration
 *   4. Global default duration   ← guarantees every customer resolves
 *
 * Platform-shared (New Optimization · TIS · Journey Planning · Route Management):
 * eventually Travel Time + Visit Duration = Working-Day Load. This is the safe first
 * stage — the resolver + global default + a visit-minutes/week helper.
 */
import { frequencyToVisitsPerWeek, type VisitFrequency } from '@/lib/route-optimization/visit-frequency';

/** Sensible platform default when nothing else is configured. */
export const DEFAULT_VISIT_DURATION_MIN = 20;

export interface VisitDurationConfig {
  /** Always present — the floor of the hierarchy. */
  globalDefaultMin: number;
  /** Optional per-channel overrides (e.g. mini_market / retail / wholesale / modern_trade). */
  byChannel?: Record<string, number>;
  /** Optional per-class (outlet grade) overrides (a/b/c/d). */
  byClass?: Record<string, number>;
}

/** The minimal customer signals the resolver reads (no TIS coupling). */
export interface VisitDurationInputs {
  /** Customer-specific duration override (most specific). */
  durationMin?: number | null;
  /** Trade channel key. */
  channel?: string | null;
  /** Outlet grade / class. */
  grade?: string | null;
}

export const defaultVisitDurationConfig = (globalDefaultMin = DEFAULT_VISIT_DURATION_MIN): VisitDurationConfig => ({ globalDefaultMin });

/** Resolve a single visit's expected duration (minutes) by precedence. Pure. */
export function resolveVisitDuration(c: VisitDurationInputs, cfg: VisitDurationConfig): number {
  if (c.durationMin != null && c.durationMin > 0) return c.durationMin;
  if (c.channel && cfg.byChannel && cfg.byChannel[c.channel] != null) return cfg.byChannel[c.channel];
  if (c.grade && cfg.byClass && cfg.byClass[c.grade] != null) return cfg.byClass[c.grade];
  return cfg.globalDefaultMin;
}

/** Expected in-store minutes per week for a customer = visits/week × resolved duration. Pure. */
export function visitMinutesPerWeek(c: VisitDurationInputs & { frequency?: VisitFrequency | null }, cfg: VisitDurationConfig): number {
  const visits = c.frequency ? frequencyToVisitsPerWeek(c.frequency) : 0;
  return visits * resolveVisitDuration(c, cfg);
}
