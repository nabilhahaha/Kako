// ============================================================================
// Global Tax — tax service gateway (the impure DB boundary). Keeps the service
// unit-testable with a fake and the engines pure. Supabase impl in
// supabase-gateway.ts (0197 lines/ledger, 0200 determination rules, 0198 profiles).
// ============================================================================

import type { DeterminationRule } from './determine';

export interface TaxLedgerWrite {
  legalEntityId: string | null;
  registrationId: string | null;
  period: string;            // 'YYYY-MM'
  direction: 'output' | 'input';
  taxCode: string;
  base: number;
  tax: number;
  documentTaxProfileId: string | null;
  reportingCategory: string | null;
  referenceType: string;
  referenceId: string;
}

export interface TaxDocLineWrite {
  referenceType: string;
  referenceId: string;
  lineNo: number;
  base: number;
  taxCode: string;
  rate: number;
  taxAmount: number;
  kind: string;
  inclusive: boolean;
  documentTaxProfileId: string | null;
}

export interface TaxGateway {
  /** Active determination rules visible to the caller (company + platform/pack defaults). */
  loadDeterminationRules(companyId: string): Promise<DeterminationRule[]>;
  /** Resolve a document-tax-profile code → its catalog id (null if unknown). */
  resolveProfileId(companyId: string, profileCode: string): Promise<string | null>;
  /** Persist the computed per-line breakdown for a document (idempotent on ref). */
  saveTaxDocumentLines(lines: TaxDocLineWrite[]): Promise<void>;
  /** Append tax-ledger entries (idempotent on ref). */
  saveTaxLedger(entries: TaxLedgerWrite[]): Promise<void>;
  /** Has tax already been assessed for this document? (idempotency) */
  hasAssessment(referenceType: string, referenceId: string): Promise<boolean>;
}
