// ============================================================================
// E-Invoicing Compliance — UAE FTA provider (Phase 5F). Adapts the Phase-5E UAE
// pack (pure invoice normalization + validation) to the country-agnostic
// EInvoiceProvider interface. Offline surface is real; the FTA e-invoicing
// connector is PAUSED until the UAE mandate + credentials land.
// ============================================================================

import type { EInvoiceProvider, EInvoiceDocument, ComplianceValidationIssue } from '../provider';
import { PausedConnectorError } from '../provider';
import {
  buildFtaInvoice,
  validateFtaInvoice,
  UAE_FTA_PACK,
  type FtaInvoiceInput,
} from '../../tax/packs/gcc/uae-fta';

export const uaeProvider: EInvoiceProvider<FtaInvoiceInput> = {
  id: UAE_FTA_PACK.id,
  country: UAE_FTA_PACK.country,
  regime: UAE_FTA_PACK.regime,
  version: UAE_FTA_PACK.version,
  capabilities: UAE_FTA_PACK.capabilities,

  validate(input): ComplianceValidationIssue[] {
    return validateFtaInvoice(input);
  },

  buildDocument(input): EInvoiceDocument {
    const inv = buildFtaInvoice(input);
    return {
      country: UAE_FTA_PACK.country,
      regime: UAE_FTA_PACK.regime,
      format: 'json',
      content: inv,
      totals: { net: inv.netAmount, tax: inv.vatTotal, total: inv.totalAmount },
    };
  },

  async submit(): Promise<never> {
    throw new PausedConnectorError('fta');
  },
};
