// ============================================================================
// E-Invoicing Compliance — UAE PINT-AE / PEPPOL provider (Phase 5G, Part 4).
// Adapts the PEPPOL/PINT-AE shared builder (peppol.ts) to the country-agnostic
// EInvoiceProvider interface. Reference-readiness: offline validate + normalized
// build are real; AS4 transport via an Accredited Service Provider is PAUSED
// (no ASP onboarding/credentials). No live FTA/ASP submission.
// ============================================================================

import type { EInvoiceProvider, EInvoiceDocument, ComplianceValidationIssue } from '../provider';
import { PausedConnectorError } from '../provider';
import { buildPintAeDocument, validatePintAeInvoice, type PintAeInvoiceInput } from '../peppol';

export const uaePeppolProvider: EInvoiceProvider<PintAeInvoiceInput> = {
  id: 'pint-ae-1.0',
  country: 'AE',
  regime: 'pint-ae',
  version: '1.0.0',
  capabilities: ['e_invoice', 'credit_note', 'debit_note', 'peppol', 'as4'],

  validate(input): ComplianceValidationIssue[] {
    return validatePintAeInvoice(input);
  },

  buildDocument(input): EInvoiceDocument {
    const doc = buildPintAeDocument(input);
    return {
      country: 'AE',
      regime: 'pint-ae',
      format: 'peppol-bis-3', // normalized; UBL-XML serialization is the paused follow-up
      content: doc,
      totals: { net: doc.netAmount, tax: doc.vatTotal, total: doc.totalAmount },
    };
  },

  async submit(): Promise<never> {
    throw new PausedConnectorError('pint-ae');
  },
};
