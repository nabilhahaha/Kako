// ============================================================================
// Global Tax — tax service (Phase 5A follow-up). Pure orchestration over the
// TaxGateway + the engines: for a document, run tax DETERMINATION (M4c) to pick
// the profile + tax code/rate, COMPUTE the VAT (M1), persist the per-line breakdown
// (M3 tax document lines) + the output tax LEDGER (M3), and return the result the
// GL orchestrator (M5 postTaxGl) posts. No-op unless KAKO_TAX is on; idempotent per
// document. The compliance pack (M6) submits later (5C+).
// ============================================================================

import { TAX_ENABLED } from './flags';
import { determineTax, type DeterminationContext } from './determine';
import { computeTax, type TaxKind, type TaxCodeRef } from './vat';
import type { TaxGateway } from './gateway';

export interface AssessTaxInput {
  companyId: string;
  legalEntityId?: string | null;
  registrationId?: string | null;
  /** Determination inputs (country, customer type, document type, …). */
  context: DeterminationContext;
  /** Document lines: net (exclusive) or gross (inclusive) amounts. */
  lines: { amount: number }[];
  inclusive?: boolean;
  period: string;            // 'YYYY-MM'
  referenceType: string;
  referenceId: string;
  asOf: string;              // document tax point (ISO date)
}

export type AssessTaxResult =
  | { assessed: true; profileCode: string; taxCode: string; totalTax: number; net: number }
  | { assessed: false; reason: 'disabled' | 'already_assessed' | 'no_rule' | 'no_lines' };

const VAT_TREATMENT_KIND: Record<string, TaxKind> = {
  standard: 'standard', zero: 'zero', exempt: 'exempt', out_of_scope: 'out_of_scope', reverse_charge: 'reverse_charge',
};

/** Assess + persist tax for a document. Pure orchestration; safe to call
 *  unconditionally (no-op when KAKO_TAX off). */
export async function assessDocumentTax(gw: TaxGateway, input: AssessTaxInput): Promise<AssessTaxResult> {
  if (!TAX_ENABLED()) return { assessed: false, reason: 'disabled' };
  if (input.lines.length === 0) return { assessed: false, reason: 'no_lines' };
  if (await gw.hasAssessment(input.referenceType, input.referenceId)) {
    return { assessed: false, reason: 'already_assessed' };
  }

  const rules = await gw.loadDeterminationRules(input.companyId);
  const det = determineTax(rules, input.context, input.asOf);
  if (!det) return { assessed: false, reason: 'no_rule' };

  const kind: TaxKind = VAT_TREATMENT_KIND[det.vatTreatment ?? ''] ?? 'standard';
  const taxCode: TaxCodeRef = { code: det.taxCode ?? det.profileCode, rate: det.taxRate ?? 0, kind };

  const breakdown = computeTax(input.lines.map((l) => ({ amount: l.amount, taxCode })), { inclusive: input.inclusive });
  const profileId = await gw.resolveProfileId(input.companyId, det.profileCode);

  await gw.saveTaxDocumentLines(breakdown.lines.map((l, i) => ({
    referenceType: input.referenceType, referenceId: input.referenceId, lineNo: i,
    base: l.base, taxCode: l.taxCode, rate: l.rate, taxAmount: l.taxAmount, kind: l.kind,
    inclusive: input.inclusive ?? false, documentTaxProfileId: profileId,
  })));

  await gw.saveTaxLedger(Object.entries(breakdown.taxByCode).map(([code, tax]) => ({
    legalEntityId: input.legalEntityId ?? null,
    registrationId: input.registrationId ?? null,
    period: input.period,
    direction: 'output',
    taxCode: code,
    base: breakdown.net,
    tax,
    documentTaxProfileId: profileId,
    reportingCategory: det.reportingCategory ?? null,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
  })));

  return { assessed: true, profileCode: det.profileCode, taxCode: taxCode.code, totalTax: breakdown.totalTax, net: breakdown.net };
}
