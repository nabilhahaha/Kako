// ============================================================================
// Role Template Versioning — upgrade + override preservation (Phase 7). Pure. The
// heart of RULE 8: when a company upgrades to a newer template version, its own
// customizations (overrides) SURVIVE. An override is the company's explicit delta
// vs the template base it was customizing; on upgrade we apply the NEW base then
// re-apply the company delta. Company isolation is structural — every function
// operates on a single company's data and returns only that company's result.
// ============================================================================

import type { TemplateSnapshot } from './versioning';

/** A company's explicit customization relative to a template base. */
export interface CompanyOverride {
  addedPermissions: string[];     // company granted beyond the base
  removedPermissions: string[];   // company revoked from the base
  dataScope?: string | null;      // company-set scope (overrides base when present)
  fieldVisibility?: Record<string, 'hidden' | 'view' | 'edit'>; // company field overrides
}

const uniq = (xs: readonly string[]): string[] => [...new Set(xs)].sort();

/** Derive a company's override by diffing its effective set vs the base it had. Pure. */
export function deriveOverride(base: TemplateSnapshot, companyEffective: TemplateSnapshot): CompanyOverride {
  const baseSet = new Set(base.permissions);
  const effSet = new Set(companyEffective.permissions);
  return {
    addedPermissions: uniq(companyEffective.permissions.filter((p) => !baseSet.has(p))),
    removedPermissions: uniq(base.permissions.filter((p) => !effSet.has(p))),
    dataScope: companyEffective.dataScope !== base.dataScope ? companyEffective.dataScope ?? null : null,
    fieldVisibility: companyEffective.fieldVisibility,
  };
}

export interface UpgradePlan {
  effective: TemplateSnapshot;     // new base with the override re-applied
  preservedOverride: CompanyOverride;
  addedByUpgrade: string[];        // permissions the new base introduces
  removedByUpgrade: string[];      // permissions the new base drops
}

/**
 * Plan an explicit upgrade to `newBase`, PRESERVING the company override. Pure.
 * effective.permissions = (newBase ∪ override.added) \ override.removed.
 */
export function planUpgrade(
  oldBase: TemplateSnapshot,
  newBase: TemplateSnapshot,
  override: CompanyOverride,
): UpgradePlan {
  const newSet = new Set(newBase.permissions);
  for (const p of override.addedPermissions) newSet.add(p);     // preserve company grants
  for (const p of override.removedPermissions) newSet.delete(p); // preserve company revokes
  const oldBaseSet = new Set(oldBase.permissions);
  const newBaseSet = new Set(newBase.permissions);
  return {
    effective: {
      permissions: uniq([...newSet]),
      dataScope: override.dataScope ?? newBase.dataScope ?? null,   // company scope wins, else new base
      actions: newBase.actions,
      approvals: newBase.approvals,
      fieldVisibility: { ...(newBase.fieldVisibility ?? {}), ...(override.fieldVisibility ?? {}) },
    },
    preservedOverride: override,
    addedByUpgrade: uniq(newBase.permissions.filter((p) => !oldBaseSet.has(p))),
    removedByUpgrade: uniq(oldBase.permissions.filter((p) => !newBaseSet.has(p))),
  };
}
