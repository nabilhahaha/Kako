// ============================================================================
// E-Invoicing Compliance — Saudi ZATCA provider (Phase 5F). Adapts the Phase-5D
// ZATCA pack (pure builder + TLV QR + validation) to the country-agnostic
// EInvoiceProvider interface. Offline surface is real; authority clearance /
// reporting submission is PAUSED (no CSID/certs). UBL XML + PIH signing land on
// this same provider once credentials exist — no platform redesign required.
// ============================================================================

import type { EInvoiceProvider, EInvoiceDocument, ComplianceValidationIssue } from '../provider';
import { PausedConnectorError } from '../provider';
import {
  buildZatcaInvoice,
  zatcaQrFromInvoice,
  validateZatcaInvoice,
  SAUDI_ZATCA_PACK,
  type ZatcaInvoiceInput,
} from '../../tax/packs/saudi/zatca';

export const zatcaProvider: EInvoiceProvider<ZatcaInvoiceInput> = {
  id: SAUDI_ZATCA_PACK.id,
  country: SAUDI_ZATCA_PACK.country,
  regime: SAUDI_ZATCA_PACK.regime,
  version: SAUDI_ZATCA_PACK.version,
  capabilities: SAUDI_ZATCA_PACK.capabilities,

  validate(input): ComplianceValidationIssue[] {
    return validateZatcaInvoice(input);
  },

  buildDocument(input): EInvoiceDocument {
    const inv = buildZatcaInvoice(input);
    return {
      country: SAUDI_ZATCA_PACK.country,
      regime: SAUDI_ZATCA_PACK.regime,
      format: 'json', // normalized JSON; UBL-XML serialization is the paused follow-up
      content: inv,
      qr: zatcaQrFromInvoice(inv),
      totals: { net: inv.taxExclusiveAmount, tax: inv.vatTotal, total: inv.taxInclusiveAmount },
    };
  },

  buildQr(input): string {
    return zatcaQrFromInvoice(buildZatcaInvoice(input));
  },

  async submit(): Promise<never> {
    throw new PausedConnectorError('zatca');
  },
};
