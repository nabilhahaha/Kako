// ============================================================================
// E-Invoicing Compliance — item coding mapping (Phase 5G). Pure, country-agnostic
// resolver from an internal item to an external coding scheme (Egypt ETA's
// EGS/GS1, GPC categories, UNSPSC, …). Reusable by every pack that must carry a
// standardized item code. The mapping table is data (per company); this only
// resolves + validates it. No DB.
// ============================================================================

export type ItemCodeScheme = 'GS1' | 'GPC' | 'EGS' | 'UNSPSC' | 'INTERNAL';

export interface ItemCodeMapping {
  internalCode: string;
  scheme: ItemCodeScheme;
  code: string;           // external code value
  description?: string;
}

export interface ItemCodeResolution {
  internalCode: string;
  scheme: ItemCodeScheme;
  code: string | null;
  resolved: boolean;
}

/** Resolve one internal item to a target scheme from the mapping table. Pure. */
export function resolveItemCode(
  internalCode: string,
  scheme: ItemCodeScheme,
  mappings: readonly ItemCodeMapping[],
): ItemCodeResolution {
  const m = mappings.find((x) => x.internalCode === internalCode && x.scheme === scheme);
  return { internalCode, scheme, code: m?.code ?? null, resolved: !!m };
}

/** Internal codes that lack a mapping for `scheme` (validation gap). Pure. */
export function missingItemCodes(
  internalCodes: readonly string[],
  scheme: ItemCodeScheme,
  mappings: readonly ItemCodeMapping[],
): string[] {
  return [...new Set(internalCodes)].filter((c) => !resolveItemCode(c, scheme, mappings).resolved);
}
