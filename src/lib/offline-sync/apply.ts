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
};

/** True when an (entity, operation) is on the safe auto-apply whitelist. Pure. */
export function isApplicable(entity: string, operation: SyncOperation): boolean {
  return (APPLY_WHITELIST[entity] ?? []).includes(operation);
}

/** The entity keys the server can currently auto-apply. Pure. */
export function applicableEntities(): string[] {
  return Object.keys(APPLY_WHITELIST);
}
