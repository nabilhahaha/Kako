// ============================================================================
// E-Invoicing Compliance — health read-model (Phase 5F). Pure rollups over
// submission rows into a per-provider health view (counts, last activity, error
// rate, status). Country-agnostic; reused by the (paused) authority connectors
// and by the Phase-6 Integration Health dashboard. No DB, no I/O.
// ============================================================================

import type { ComplianceStatus } from './lifecycle';

/** A minimal submission projection the rollup needs (DB-shape-agnostic). */
export interface SubmissionRow {
  country: string;
  regime: string;
  status: ComplianceStatus;
  updatedAt: string; // ISO
}

export interface SubmissionCounts {
  total: number;
  pending: number;     // draft/generated/signed/queued
  inFlight: number;    // submitting
  accepted: number;    // cleared/reported
  rejected: number;
  failed: number;
  deadLettered: number;
}

export type HealthStatus = 'healthy' | 'degraded' | 'down';

export interface ProviderHealth {
  country: string;
  regime: string;
  counts: SubmissionCounts;
  lastActivityAt: string | null;
  /** (rejected + failed + deadLettered) / total, 0..1. */
  errorRate: number;
  status: HealthStatus;
}

const PENDING: ComplianceStatus[] = ['draft', 'generated', 'signed', 'validated', 'queued'];
const IN_FLIGHT: ComplianceStatus[] = ['submitting', 'submitted'];
const ACCEPTED: ComplianceStatus[] = ['cleared', 'reported', 'accepted', 'accepted_with_warning'];

function emptyCounts(): SubmissionCounts {
  return { total: 0, pending: 0, inFlight: 0, accepted: 0, rejected: 0, failed: 0, deadLettered: 0 };
}

function tally(counts: SubmissionCounts, status: ComplianceStatus): void {
  counts.total += 1;
  if (PENDING.includes(status)) counts.pending += 1;
  else if (IN_FLIGHT.includes(status)) counts.inFlight += 1;
  else if (ACCEPTED.includes(status)) counts.accepted += 1;
  else if (status === 'rejected') counts.rejected += 1;
  else if (status === 'failed') counts.failed += 1;
  else if (status === 'dead_lettered') counts.deadLettered += 1;
}

/** Map error rate + dead-letter presence to a traffic-light status. Pure. */
export function computeHealthStatus(counts: SubmissionCounts): HealthStatus {
  if (counts.total === 0) return 'healthy';
  if (counts.deadLettered > 0) return 'down';
  const errorRate = (counts.rejected + counts.failed + counts.deadLettered) / counts.total;
  if (errorRate >= 0.25) return 'down';
  if (errorRate > 0) return 'degraded';
  return 'healthy';
}

/** Roll submission rows up into per-(country,regime) health. Pure. */
export function summarizeProviderHealth(rows: readonly SubmissionRow[]): ProviderHealth[] {
  const byKey = new Map<string, { country: string; regime: string; counts: SubmissionCounts; last: string | null }>();
  for (const r of rows) {
    const key = `${r.country}:${r.regime}`;
    let g = byKey.get(key);
    if (!g) { g = { country: r.country, regime: r.regime, counts: emptyCounts(), last: null }; byKey.set(key, g); }
    tally(g.counts, r.status);
    if (!g.last || r.updatedAt > g.last) g.last = r.updatedAt;
  }
  return [...byKey.values()]
    .map((g) => {
      const { total, rejected, failed, deadLettered } = g.counts;
      return {
        country: g.country,
        regime: g.regime,
        counts: g.counts,
        lastActivityAt: g.last,
        errorRate: total === 0 ? 0 : (rejected + failed + deadLettered) / total,
        status: computeHealthStatus(g.counts),
      };
    })
    .sort((a, b) => (a.country + a.regime).localeCompare(b.country + b.regime));
}
