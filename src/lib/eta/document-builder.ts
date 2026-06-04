// ── Build an ETA e-invoice Document from a normalized invoice input ──
// Pure & deterministic (no network, no DB) so it is fully unit-testable. The
// signing step is separate (see signing.ts) and the API call lives in client.ts.

import { etaConfig } from './config';
import { TAX_TYPE_VAT, TAX_SUBTYPE_VAT, round5, etaDateTime } from './codes';
import type {
  EtaDocument,
  EtaInvoiceInput,
  EtaInvoiceLine,
  EtaTaxTotal,
} from './types';

export function buildEtaDocument(input: EtaInvoiceInput): EtaDocument {
  const lines: EtaInvoiceLine[] = input.lines.map((l) => {
    const qty = l.quantity;
    const unitPrice = l.unitPrice;
    const salesTotal = round5(unitPrice * qty);
    const discountAmount = round5(l.discountAmount ?? 0);
    const netTotal = round5(salesTotal - discountAmount);
    const rate = l.taxRate ?? 0;
    const taxAmount = round5((netTotal * rate) / 100);
    const total = round5(netTotal + taxAmount);

    return {
      description: l.description,
      itemType: l.itemCodeType,
      itemCode: l.itemCode,
      unitType: l.unitType,
      quantity: qty,
      internalCode: l.internalCode,
      salesTotal,
      totalTaxableFees: 0,
      netTotal,
      itemsDiscount: 0,
      unitValue: { currencySold: 'EGP', amountEGP: round5(unitPrice) },
      discount: {
        rate: salesTotal > 0 ? round5((discountAmount / salesTotal) * 100) : 0,
        amount: discountAmount,
      },
      taxableItems:
        rate > 0
          ? [{ taxType: TAX_TYPE_VAT, amount: taxAmount, subType: TAX_SUBTYPE_VAT, rate }]
          : [],
      total,
    };
  });

  const totalSalesAmount = round5(lines.reduce((s, l) => s + l.salesTotal, 0));
  const totalItemsDiscountAmount = round5(
    lines.reduce((s, l) => s + l.discount.amount, 0),
  );
  const netAmount = round5(totalSalesAmount - totalItemsDiscountAmount);
  const vatTotal = round5(
    lines.reduce((s, l) => s + l.taxableItems.reduce((t, ti) => t + ti.amount, 0), 0),
  );
  const taxTotals: EtaTaxTotal[] =
    vatTotal > 0 ? [{ taxType: TAX_TYPE_VAT, amount: vatTotal }] : [];
  const totalAmount = round5(netAmount + vatTotal);

  return {
    issuer: input.issuer,
    receiver: input.receiver,
    documentType: input.documentType ?? 'I',
    documentTypeVersion: etaConfig.documentTypeVersion,
    dateTimeIssued: etaDateTime(input.issuedAt),
    taxpayerActivityCode: input.taxpayerActivityCode,
    internalID: input.internalId,
    purchaseOrderReference: input.purchaseOrderReference,
    invoiceLines: lines,
    totalDiscountAmount: totalItemsDiscountAmount,
    totalSalesAmount,
    netAmount,
    taxTotals,
    totalAmount,
    extraDiscountAmount: 0,
    totalItemsDiscountAmount,
  };
}
