// ============================================================================
// Global Tax — document tax treatment resolver (Phase 5A · M4b). Pure, no DB.
// Resolves which document tax profile applies to a document via the §1A.1 cascade
// Company → Legal Entity → Customer → Document Type — MOST-SPECIFIC wins, then
// explicit priority, effective-dated (as-of the document tax point). A per-document
// override short-circuits resolution (within what the caller permits). This is the
// rev-3 document-level model; the broader determination engine (M4c) adds more
// inputs and produces the same profile output.
// ============================================================================

export interface DocTreatmentRule {
  id: string;
  legalEntityId?: string | null;   // null = wildcard
  customerId?: string | null;      // null = wildcard
  documentType?: string | null;    // null = wildcard
  profileCode: string;             // resolved document tax profile
  priority: number;                // lower = preferred on a tie
  effectiveFrom?: string | null;   // ISO date (null = open start)
  effectiveTo?: string | null;     // ISO date (null = open end)
}

export interface DocTaxContext {
  legalEntityId?: string | null;
  customerId?: string | null;
  documentType?: string | null;
}

export interface DocResolution {
  profileCode: string;
  ruleId: string | null;       // null when from an override
  specificity: number;         // matched-dimension weight (−1 = override)
}

// Specificity weights reflect the cascade depth (Document Type is most specific).
const W_DOC_TYPE = 4;
const W_CUSTOMER = 2;
const W_LEGAL_ENTITY = 1;

function effectiveAsOf(r: DocTreatmentRule, asOf: string): boolean {
  if (r.effectiveFrom && asOf < r.effectiveFrom) return false;
  if (r.effectiveTo && asOf > r.effectiveTo) return false;
  return true;
}

/** Does the rule match the context? A non-null rule dimension must equal the
 *  context; a null dimension is a wildcard. */
function matches(r: DocTreatmentRule, ctx: DocTaxContext): boolean {
  if (r.legalEntityId != null && r.legalEntityId !== ctx.legalEntityId) return false;
  if (r.customerId != null && r.customerId !== ctx.customerId) return false;
  if (r.documentType != null && r.documentType !== ctx.documentType) return false;
  return true;
}

function specificity(r: DocTreatmentRule): number {
  return (r.documentType != null ? W_DOC_TYPE : 0)
    + (r.customerId != null ? W_CUSTOMER : 0)
    + (r.legalEntityId != null ? W_LEGAL_ENTITY : 0);
}

/** Resolve the document tax profile. `override` (an explicit profile code) wins.
 *  Otherwise: effective + matching rules, most-specific first, then lowest
 *  priority, then rule id (total order). Returns null when nothing matches. */
export function resolveDocumentTaxProfile(
  rules: DocTreatmentRule[],
  ctx: DocTaxContext,
  asOf: string,
  override?: string | null,
): DocResolution | null {
  if (override) return { profileCode: override, ruleId: null, specificity: -1 };

  const candidates = rules
    .filter((r) => effectiveAsOf(r, asOf) && matches(r, ctx))
    .map((r) => ({ r, s: specificity(r) }))
    .sort((a, b) => (b.s - a.s) || (a.r.priority - b.r.priority) || (a.r.id < b.r.id ? -1 : 1));

  const best = candidates[0];
  return best ? { profileCode: best.r.profileCode, ruleId: best.r.id, specificity: best.s } : null;
}
