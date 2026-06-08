// ============================================================================
// E-Invoicing Compliance — Egypt ETA provider (Phase 5F). Adapts the Phase-5C
// ETA pack (pure JSON document builder + validation) to the country-agnostic
// EInvoiceProvider interface. Offline surface is real; ETA submission + digital
// signing are PAUSED (no ETA credentials). ETA defines no QR at issue time.
// ============================================================================

import type { EInvoiceProvider, EInvoiceDocument, ComplianceValidationIssue } from '../provider';
import { PausedConnectorError } from '../provider';
import {
  buildEtaDocument,
  validateEtaDocument,
  EGYPT_ETA_PACK,
  type EtaDocInput,
} from '../../tax/packs/egypt/eta';

export const etaProvider: EInvoiceProvider<EtaDocInput> = {
  id: EGYPT_ETA_PACK.id,
  country: EGYPT_ETA_PACK.country,
  regime: EGYPT_ETA_PACK.regime,
  version: EGYPT_ETA_PACK.version,
  capabilities: EGYPT_ETA_PACK.capabilities,

  validate(input): ComplianceValidationIssue[] {
    return validateEtaDocument(input);
  },

  buildDocument(input): EInvoiceDocument {
    const doc = buildEtaDocument(input);
    return {
      country: EGYPT_ETA_PACK.country,
      regime: EGYPT_ETA_PACK.regime,
      format: 'json', // ETA submits signed JSON
      content: doc,
      totals: { net: doc.netAmount, tax: doc.taxTotals[0]?.amount ?? 0, total: doc.totalAmount },
    };
  },

  async submit(): Promise<never> {
    throw new PausedConnectorError('eta');
  },
};
