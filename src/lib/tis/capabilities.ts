/**
 * Territory Intelligence Studio — capability matrix (TIS-0-2). Pure, no I/O.
 *
 * Decides which TIS stages/overlays are available from WHAT DATA IS PRESENT in the
 * dataset (not from build flags), and derives the deployment mode (A/B/C). This is
 * the single source of truth behind graceful degradation (strategy §4a): the same
 * flags drive Mode A/B/C UX and the "needs X" empty states. A feature lights up
 * when its required signals are present for at least `minFraction` of customers.
 */
import { type TisDataset, coverageOf, hasGeo, hasFrequency, hasGrade, hasSalesValue, hasCoverage, hasHealth } from './dataset';
import type { TisMode } from './dataset';

/** Default presence threshold for a capability to count as available. */
export const CAPABILITY_MIN_FRACTION = 0.5;

export interface TisCapabilities {
  territoryAudit: boolean;
  salesForceSizing: boolean;
  routeOptimization: boolean;
  visualPlanning: boolean;
  coverageOverlay: boolean;
  salesOverlay: boolean;
  healthOverlay: boolean;
}

export interface TisSignals {
  geo: number;
  frequency: number;
  grade: number;
  salesValue: number;
  coverage: number;
  health: number;
}

export interface TisCapabilityResult {
  mode: TisMode;
  capabilities: TisCapabilities;
  /** Present-field fractions (0–1) — drive "needs X" hints + progress. */
  signals: TisSignals;
}

/** Resolve capabilities + mode for a dataset. Pure, deterministic. */
export function resolveCapabilities(dataset: TisDataset, minFraction = CAPABILITY_MIN_FRACTION): TisCapabilityResult {
  const signals: TisSignals = {
    geo: coverageOf(dataset, hasGeo),
    frequency: coverageOf(dataset, hasFrequency),
    grade: coverageOf(dataset, hasGrade),
    salesValue: coverageOf(dataset, hasSalesValue),
    coverage: coverageOf(dataset, hasCoverage),
    health: coverageOf(dataset, hasHealth),
  };
  const has = (v: number) => v >= minFraction;

  const geo = has(signals.geo);
  const freq = has(signals.frequency);
  const grade = has(signals.grade);
  const coverage = has(signals.coverage);
  const health = has(signals.health);

  const capabilities: TisCapabilities = {
    // Audit needs locations + a priority signal (grade or frequency).
    territoryAudit: geo && (grade || freq),
    // Sizing needs workload (frequency); sales value only enriches.
    salesForceSizing: freq,
    // Optimization needs locations + workload.
    routeOptimization: geo && freq,
    // Map planning needs locations.
    visualPlanning: geo,
    coverageOverlay: coverage,
    salesOverlay: has(signals.salesValue),
    healthOverlay: health,
  };

  // Mode: A = optimization-only (no coverage); B = connected (coverage present);
  // C = full (coverage + health/execution signals).
  const mode: TisMode = coverage && health ? 'C' : coverage ? 'B' : 'A';

  return { mode, capabilities, signals };
}
