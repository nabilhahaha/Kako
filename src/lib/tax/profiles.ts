// ============================================================================
// Global Tax — document tax profile catalog (Phase 5A · M4a). Pure constants +
// helpers mirroring the seeded platform catalog (migration 0198). A profile maps a
// document to a tax KIND (§1) + a COMPLIANCE CLASS the country packs key off
// (§1A.4). Single-sourced so the engine, determination, and packs reference the
// same codes (greppable).
// ============================================================================

import type { TaxKind } from './vat';

export type ComplianceClass = 'e_invoice' | 'e_receipt' | 'simplified' | 'none';

export interface DocumentTaxProfile {
  code: string;
  name: string;
  taxKind: TaxKind | 'none';
  complianceClass: ComplianceClass;
  isTaxable: boolean;
  isNote: boolean;
  requiresOriginalRef: boolean;
}

/** The 12 platform document tax profiles (kept in lockstep with 0198). */
export const DOCUMENT_TAX_PROFILES: readonly DocumentTaxProfile[] = [
  { code: 'tax_invoice', name: 'Tax Invoice', taxKind: 'standard', complianceClass: 'e_invoice', isTaxable: true, isNote: false, requiresOriginalRef: false },
  { code: 'simplified_tax_invoice', name: 'Simplified Tax Invoice', taxKind: 'standard', complianceClass: 'simplified', isTaxable: true, isNote: false, requiresOriginalRef: false },
  { code: 'non_tax_invoice', name: 'Non-Tax Invoice', taxKind: 'none', complianceClass: 'none', isTaxable: false, isNote: false, requiresOriginalRef: false },
  { code: 'credit_note', name: 'Credit Note', taxKind: 'none', complianceClass: 'none', isTaxable: false, isNote: true, requiresOriginalRef: true },
  { code: 'debit_note', name: 'Debit Note', taxKind: 'none', complianceClass: 'none', isTaxable: false, isNote: true, requiresOriginalRef: true },
  { code: 'tax_credit_note', name: 'Tax Credit Note', taxKind: 'standard', complianceClass: 'e_invoice', isTaxable: true, isNote: true, requiresOriginalRef: true },
  { code: 'tax_debit_note', name: 'Tax Debit Note', taxKind: 'standard', complianceClass: 'e_invoice', isTaxable: true, isNote: true, requiresOriginalRef: true },
  { code: 'receipt', name: 'Receipt', taxKind: 'none', complianceClass: 'none', isTaxable: false, isNote: false, requiresOriginalRef: false },
  { code: 'tax_receipt', name: 'Tax Receipt', taxKind: 'standard', complianceClass: 'e_receipt', isTaxable: true, isNote: false, requiresOriginalRef: false },
  { code: 'out_of_scope', name: 'Out Of Scope', taxKind: 'out_of_scope', complianceClass: 'none', isTaxable: false, isNote: false, requiresOriginalRef: false },
  { code: 'zero_rated', name: 'Zero Rated', taxKind: 'zero', complianceClass: 'e_invoice', isTaxable: true, isNote: false, requiresOriginalRef: false },
  { code: 'exempt', name: 'Exempt', taxKind: 'exempt', complianceClass: 'none', isTaxable: false, isNote: false, requiresOriginalRef: false },
] as const;

const BY_CODE = new Map(DOCUMENT_TAX_PROFILES.map((p) => [p.code, p]));

/** Look up a platform profile by code (undefined if not a platform profile). */
export function getDocumentTaxProfile(code: string): DocumentTaxProfile | undefined {
  return BY_CODE.get(code);
}
