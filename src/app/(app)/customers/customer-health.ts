/**
 * Customer health (G3) — pure derivation, no I/O, no React. Reuses the existing
 * Phase-3 `customer-timeline/health` scorer, deriving its inputs from the G2
 * detail bundle (last-activity + statement overdue + the merged timeline) so we
 * do NOT need to activate the dormant `erp_customer_timeline` stream. Health is a
 * DERIVED operational signal — kept entirely separate from the customer master
 * status (Active/Inactive/Suspended/Blocked).
 */
import { healthScore } from '@/lib/customer-timeline/health';
import type { CustomerHealthInputs } from '@/lib/customer-timeline/types';

/** Approved bands (higher = healthier). */
export type HealthBand = 'healthy' | 'at_risk' | 'inactive' | 'critical';

export function healthBand(score: number): HealthBand {
  if (score >= 80) return 'healthy';
  if (score >= 60) return 'at_risk';
  if (score >= 30) return 'inactive';
  return 'critical';
}

export const HEALTH_BAND_VARIANT: Record<HealthBand, 'success' | 'warning' | 'secondary' | 'destructive'> = {
  healthy: 'success',
  at_risk: 'warning',
  inactive: 'secondary',
  critical: 'destructive',
};

export const HEALTH_BAND_KEY: Record<HealthBand, string> = {
  healthy: 'customer360.bandHealthy',
  at_risk: 'customer360.bandAtRisk',
  inactive: 'customer360.bandInactive',
  critical: 'customer360.bandCritical',
};

/** The minimal slice of the detail bundle health needs (keeps this decoupled +
 *  trivially testable). */
export interface HealthBundleInputs {
  lastActivity: {
    lastVisit: string | null;
    lastOrder: string | null;
    lastInvoice: string | null;
    lastCollection: string | null;
    lastReturn: string | null;
  };
  timeline: { kind: string; date: string }[];
  overdueAmount: number;
}

const MS_PER_DAY = 86_400_000;
function daysSince(iso: string | null, asOf: string): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.parse(asOf) - Date.parse(iso)) / MS_PER_DAY));
}

/** Derive the scorer inputs from the bundle. "Last order" for scoring = the most
 *  recent actual sale (invoice OR sales order), so invoice-only tenants aren't
 *  mis-scored as stale. near-expiry/tenure are unavailable here → neutral. */
export function deriveHealthInputs(b: HealthBundleInputs, asOf: string): CustomerHealthInputs {
  const la = b.lastActivity;
  const lastSale = [la.lastInvoice, la.lastOrder].filter((x): x is string => !!x).sort().pop() ?? null;
  const within90 = (iso: string) => {
    const d = daysSince(iso, asOf);
    return d != null && d <= 90;
  };
  return {
    daysSinceLastOrder: daysSince(lastSale, asOf),
    daysSinceLastVisit: daysSince(la.lastVisit, asOf),
    daysSinceLastCollection: daysSince(la.lastCollection, asOf),
    hasOverdue: b.overdueAmount > 0,
    nearExpiryOpen: 0,
    returnsLast90: b.timeline.filter((e) => e.kind === 'return' && within90(e.date)).length,
    ordersLast90: b.timeline.filter((e) => e.kind === 'invoice' && within90(e.date)).length,
    tenureDays: null,
  };
}

export interface CustomerHealth {
  score: number;
  band: HealthBand;
  inputs: CustomerHealthInputs;
}

export function customerHealth(b: HealthBundleInputs, asOf: string = new Date().toISOString()): CustomerHealth {
  const inputs = deriveHealthInputs(b, asOf);
  const score = healthScore(inputs);
  return { score, band: healthBand(score), inputs };
}
