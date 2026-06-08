// ============================================================================
// Role Template Versioning (Phase 7) — pure engine. Enforces the MANDATORY policy:
// platform role templates are versioned (Salesman v1/v2/v3); each company adopts a
// specific version; platform changes create NEW versions and affect new companies
// only; existing companies upgrade EXPLICITLY (never automatically); and company
// overrides SURVIVE upgrades. No DB, no I/O.
// ============================================================================

export type TemplateStatus = 'draft' | 'published' | 'archived';

/** A versioned platform role template. `snapshot` is the template definition
 *  (permissions / data scope / actions / approvals / field visibility). */
export interface RoleTemplateVersion {
  roleKey: string;
  versionNo: number;
  status: TemplateStatus;
  snapshot: TemplateSnapshot;
}

/** The governed surface a template defines (all company-overridable). */
export interface TemplateSnapshot {
  permissions: string[];
  dataScope?: string | null;          // 'own'|'team'|'area'|'region'|'branch'|'company'|'custom'
  actions?: string[];
  approvals?: string[];
  fieldVisibility?: Record<string, 'hidden' | 'view' | 'edit'>;
}

/** The latest PUBLISHED version for a role (highest version_no). Pure. */
export function latestPublished(versions: readonly RoleTemplateVersion[], roleKey: string): RoleTemplateVersion | undefined {
  return versions
    .filter((v) => v.roleKey === roleKey && v.status === 'published')
    .sort((a, b) => b.versionNo - a.versionNo)[0];
}

/** True when a newer published version exists than the one adopted. Pure. */
export function upgradeAvailable(adoptedVersion: number | null, latestVersion: number | null): boolean {
  if (latestVersion == null) return false;
  if (adoptedVersion == null) return true;
  return latestVersion > adoptedVersion;
}

export interface CompanyVersionStatus {
  roleKey: string;
  currentVersion: number | null;
  latestVersion: number | null;
  upgradeAvailable: boolean;
}

/**
 * Per-company version status (current / latest / upgrade-available) for a role —
 * the data the Platform Owner sees (RULE 7). Pure.
 */
export function versionStatus(
  versions: readonly RoleTemplateVersion[],
  roleKey: string,
  adoptedVersion: number | null,
): CompanyVersionStatus {
  const latest = latestPublished(versions, roleKey)?.versionNo ?? null;
  return { roleKey, currentVersion: adoptedVersion, latestVersion: latest, upgradeAvailable: upgradeAvailable(adoptedVersion, latest) };
}
