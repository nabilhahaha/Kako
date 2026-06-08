// ============================================================================
// Role Governance — data scope engine (Phase 7). Pure. Resolves a role's data
// VISIBILITY (own/team/area/region/branch/company/custom) into a concrete filter
// over an entity's owner dimensions — so a salesman sees own customers, a
// supervisor team customers, an area manager area customers, etc. No I/O.
// ============================================================================

export type DataScope = 'own' | 'team' | 'area' | 'region' | 'branch' | 'company' | 'custom';

/** The acting user's position in the hierarchy (from ownership/assignments). */
export interface UserPosition {
  userId: string;
  teamUserIds?: string[];      // direct reports (for 'team')
  areaId?: string | null;
  regionId?: string | null;
  branchId?: string | null;
  companyId: string;
}

/** A record's owner/dimension attributes, used to test visibility. */
export interface ScopedRecord {
  ownerUserId?: string | null;
  areaId?: string | null;
  regionId?: string | null;
  branchId?: string | null;
  companyId: string;
}

export interface ScopeFilter {
  scope: DataScope;
  /** Allowed owner user ids (own/team); empty = not owner-constrained. */
  ownerUserIds: string[];
  areaId?: string | null;
  regionId?: string | null;
  branchId?: string | null;
  /** Company-wide (no sub-company constraint). */
  companyWide: boolean;
  customFilter?: Record<string, unknown> | null;
}

/** Build the visibility filter for a scope + user position. Pure. */
export function resolveScopeFilter(scope: DataScope, pos: UserPosition, customFilter?: Record<string, unknown> | null): ScopeFilter {
  const base: ScopeFilter = { scope, ownerUserIds: [], companyWide: false, customFilter: null };
  switch (scope) {
    case 'own': return { ...base, ownerUserIds: [pos.userId] };
    case 'team': return { ...base, ownerUserIds: [pos.userId, ...(pos.teamUserIds ?? [])] };
    case 'area': return { ...base, areaId: pos.areaId ?? null };
    case 'region': return { ...base, regionId: pos.regionId ?? null };
    case 'branch': return { ...base, branchId: pos.branchId ?? null };
    case 'company': return { ...base, companyWide: true };
    case 'custom': return { ...base, customFilter: customFilter ?? {} };
    default: return base;
  }
}

/** True when `rec` is visible under `filter` (always company-isolated). Pure. */
export function isVisible(filter: ScopeFilter, rec: ScopedRecord, pos: UserPosition): boolean {
  if (rec.companyId !== pos.companyId) return false;               // hard multi-tenant boundary
  switch (filter.scope) {
    case 'own': case 'team': return !!rec.ownerUserId && filter.ownerUserIds.includes(rec.ownerUserId);
    case 'area': return filter.areaId != null && rec.areaId === filter.areaId;
    case 'region': return filter.regionId != null && rec.regionId === filter.regionId;
    case 'branch': return filter.branchId != null && rec.branchId === filter.branchId;
    case 'company': return true;
    case 'custom': return true; // custom predicates are applied by the caller's query
    default: return false;
  }
}

/** Filter a record set by scope. Pure. */
export function applyScope<T extends ScopedRecord>(records: readonly T[], scope: DataScope, pos: UserPosition, customFilter?: Record<string, unknown> | null): T[] {
  const f = resolveScopeFilter(scope, pos, customFilter);
  return records.filter((r) => isVisible(f, r, pos));
}
