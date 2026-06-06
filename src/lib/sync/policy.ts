// ============================================================================
// Per-entity sync classification — the LOCKED §14 matrix (owner decision).
//
// Shared by the client engine (conflict policy) and the server /api/sync apply
// (how a pushed op is merged). Pure + dependency-free.
// ============================================================================

import type { ConflictPolicy } from './types';

/** How an entity's writes reconcile when local and cloud diverge. */
export type EntitySyncKind = 'append-only' | 'last-write-wins' | 'field-merge' | 'review';

/** The owner-locked classification. Unknown entities default to LWW (safe,
 *  deterministic). Keep in sync with docs/architecture/offline-first-sync.md §14. */
const REGISTRY: Record<string, EntitySyncKind> = {
  visits: 'append-only',
  orders: 'append-only',
  audit_logs: 'append-only',
  // Financial ledger documents (§14 "immutable ledger events"): once created they
  // are never merged in place — status transitions (issue/complete) just carry the
  // latest authoritative image, and corrections are new compensating documents.
  sales_invoices: 'append-only',
  sales_returns: 'append-only',
  customer_payments: 'append-only',
  customers: 'field-merge',
  products: 'last-write-wins',
  settings: 'last-write-wins',
  inventory_counts: 'review',
};

export function entityKind(entity: string): EntitySyncKind {
  return REGISTRY[entity] ?? 'last-write-wins';
}

/** Map the entity kind to a client-engine ConflictPolicy. Append-only rows never
 *  overwrite an existing one (the local op is an authoritative insert →
 *  client-wins); review rows defer to the server until a human resolves them. */
export function clientPolicyFor(entity: string): ConflictPolicy {
  switch (entityKind(entity)) {
    case 'append-only': return 'client-wins';
    case 'field-merge': return 'field-merge';
    case 'review': return 'server-wins';
    case 'last-write-wins':
    default: return 'last-write-wins';
  }
}
