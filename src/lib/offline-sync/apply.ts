// ============================================================================
// Offline Sync — server apply whitelist (Phase 7B / mobile client). Pure. The
// intake route persists EVERY queued mutation (idempotently) and resolves it via
// the conflict engine, but only AUTO-APPLIES a safe, additive, idempotent
// whitelist server-side. Everything else is recorded as 'pending' for a future
// per-entity handler — so the device can never auto-write unsafe operations.
// New safe handlers are added by extending this whitelist + the route switch.
// ============================================================================

import type { SyncOperation } from './types';

/** entity → operations that are safe to auto-apply on intake. */
export const APPLY_WHITELIST: Record<string, readonly SyncOperation[]> = {
  van_expense: ['create'],
  visit_checkin: ['create'],
  collection: ['create'],
  survey: ['create'],
};

/** True when an (entity, operation) is on the safe auto-apply whitelist. Pure. */
export function isApplicable(entity: string, operation: SyncOperation): boolean {
  return (APPLY_WHITELIST[entity] ?? []).includes(operation);
}

/** The entity keys the server can currently auto-apply. Pure. */
export function applicableEntities(): string[] {
  return Object.keys(APPLY_WHITELIST);
}

/**
 * The rich server verdict for an applied offline mutation. The coarse
 * `erp_offline_mutations.status` stays applied/rejected; this nuance is stored in
 * the `verdict` column and shown on the device (the field user sees the visit /
 * collection move from "Pending Validation" to its final outcome).
 */
export type Verdict =
  | 'valid' | 'out_of_route' | 'gps_violation' | 'blocked'   // visit outcomes
  | 'accepted' | 'rejected' | 'duplicate' | 'exception';     // collection outcomes

/** Map an erp_check_in_visit result to a single field-facing verdict. Pure.
 *  Precedence: blocked (needs approval) → gps_violation → out_of_route → valid. */
export function mapVisitVerdict(result: {
  blocked?: boolean; violation?: boolean; out_of_route?: boolean;
}): Verdict {
  if (result.blocked) return 'blocked';
  if (result.violation) return 'gps_violation';
  if (result.out_of_route) return 'out_of_route';
  return 'valid';
}
