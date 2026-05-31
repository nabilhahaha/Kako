/** ── Data Integration — shared, pure helpers ───────────────────────────────
 *  Entity-based, reusable primitives for the inbound REST API (/api/v1) and the
 *  API-keys UI. No DB/session/node dependencies, so they're safe to import from
 *  client components and unit-testable. (The node-crypto key hash lives in
 *  integration-crypto.ts so this module stays client-safe.) */

/** Entities exposed on the inbound API in Phase 2A. Expand incrementally as the
 *  framework is proven — adding an entity here is the ONLY change needed (no
 *  migration), because writes go through the existing entity-registry path. */
export const INBOUND_ENTITIES = ['customer', 'supplier', 'product'] as const;
export type InboundEntity = (typeof INBOUND_ENTITIES)[number];

export function isInboundEntity(key: string): key is InboundEntity {
  return (INBOUND_ENTITIES as readonly string[]).includes(key);
}

export type ScopeAction = 'read' | 'write';

/** Scopes are entity-based: '{entity}:read' / '{entity}:write'. A write to an
 *  entity requires exactly its `:write` scope — never a global wildcard. */
export function scopeFor(entity: string, action: ScopeAction): string {
  return `${entity}:${action}`;
}
export function hasScope(scopes: string[], entity: string, action: ScopeAction): boolean {
  return scopes.includes(scopeFor(entity, action));
}

/** Valid scope string shape (kept in sync with the DB-side format check in
 *  migration 0091's erp_api_key_create). */
const SCOPE_RE = /^[a-z_]+:(read|write)$/;
export function isValidScope(scope: string): boolean {
  return SCOPE_RE.test(scope);
}

/** The set of scopes offered in the UI for the currently-enabled inbound
 *  entities (both read + write per entity). */
export function offeredScopes(): string[] {
  return INBOUND_ENTITIES.flatMap((e) => [scopeFor(e, 'read'), scopeFor(e, 'write')]);
}

/** Inbound rate limit: requests per API key per rolling window. */
export const RATE_LIMIT_PER_WINDOW = 120;
export const RATE_WINDOW_MS = 60_000;
