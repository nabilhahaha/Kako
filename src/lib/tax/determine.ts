// ============================================================================
// Global Tax — tax determination rules engine (Phase 5A · M4c). Pure, no DB.
// Automatically determines a document's tax treatment from the transaction context
// (proposal §1B): match inputs → outputs (profile, VAT treatment, code/rate,
// compliance, country pack, reporting category). Deterministic MOST-SPECIFIC-wins
// over the fixed precedence order, then explicit priority; effective-dated; returns
// an explainable trace (which rule fired). Removes manual per-document selection.
// ============================================================================

export interface DeterminationInputs {
  country?: string | null;
  legalEntityId?: string | null;
  vatRegistrationId?: string | null;
  customerType?: string | null;
  customerClassification?: string | null;
  channel?: string | null;
  documentType?: string | null;
  productTaxCode?: string | null;
  productCategory?: string | null;
  transactionType?: string | null;
}

export interface DeterminationOutputs {
  profileCode: string;
  vatTreatment?: string | null;
  taxCode?: string | null;
  taxRate?: number | null;
  complianceRequirement?: string | null;
  countryPack?: string | null;
  reportingCategory?: string | null;
}

export interface DeterminationRule extends DeterminationInputs, DeterminationOutputs {
  id: string;
  priority: number;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}

export type DeterminationContext = DeterminationInputs;

export interface DeterminationResult extends DeterminationOutputs {
  ruleId: string;
  specificity: number;        // matched-dimension weight (explainability)
  matched: string[];          // which dimensions matched (the "why")
}

// Precedence (proposal §1B.3), most significant first → descending weights so a
// match on a higher dimension dominates lower ones (deterministic ordering).
const DIMENSIONS: { key: keyof DeterminationInputs; weight: number }[] = [
  { key: 'country', weight: 1 << 9 },
  { key: 'legalEntityId', weight: 1 << 8 },
  { key: 'vatRegistrationId', weight: 1 << 7 },
  { key: 'documentType', weight: 1 << 6 },
  { key: 'customerType', weight: 1 << 5 },
  { key: 'customerClassification', weight: 1 << 4 },
  { key: 'channel', weight: 1 << 3 },
  { key: 'productTaxCode', weight: 1 << 2 },
  { key: 'productCategory', weight: 1 << 1 },
  { key: 'transactionType', weight: 1 << 0 },
];

function effectiveAsOf(r: DeterminationRule, asOf: string): boolean {
  if (r.effectiveFrom && asOf < r.effectiveFrom) return false;
  if (r.effectiveTo && asOf > r.effectiveTo) return false;
  return true;
}

/** Determine the tax treatment for a transaction context. Pure. Most-specific
 *  rule wins (precedence-weighted), then lowest priority, then rule id. Returns
 *  null when no rule matches. */
export function determineTax(rules: DeterminationRule[], ctx: DeterminationContext, asOf: string): DeterminationResult | null {
  let best: { r: DeterminationRule; score: number; matched: string[] } | null = null;

  for (const r of rules) {
    if (!effectiveAsOf(r, asOf)) continue;
    let score = 0;
    const matched: string[] = [];
    let ok = true;
    for (const d of DIMENSIONS) {
      const ruleVal = r[d.key];
      if (ruleVal == null) continue;            // wildcard
      if (ruleVal !== ctx[d.key]) { ok = false; break; }
      score += d.weight;
      matched.push(d.key);
    }
    if (!ok) continue;
    if (!best || score > best.score || (score === best.score && (r.priority < best.r.priority || (r.priority === best.r.priority && r.id < best.r.id)))) {
      best = { r, score, matched };
    }
  }

  if (!best) return null;
  const { r, score, matched } = best;
  return {
    profileCode: r.profileCode,
    vatTreatment: r.vatTreatment ?? null,
    taxCode: r.taxCode ?? null,
    taxRate: r.taxRate ?? null,
    complianceRequirement: r.complianceRequirement ?? null,
    countryPack: r.countryPack ?? null,
    reportingCategory: r.reportingCategory ?? null,
    ruleId: r.id,
    specificity: score,
    matched,
  };
}
