import { describe, it, expect } from 'vitest';
import { buildEtaDocument } from './document-builder';
import { serializeForSignature } from './signing';
import type { EtaInvoiceInput } from './types';

const issuer = {
  type: 'B' as const,
  id: '123456789',
  name: 'Al Noor Trading',
  address: {
    country: 'EG',
    governate: 'Cairo',
    regionCity: 'Nasr City',
    street: 'Abbas El Akkad',
    buildingNumber: '12',
    branchId: '0',
  },
};

const sample: EtaInvoiceInput = {
  internalId: 'INV-001',
  issuedAt: new Date('2026-05-30T12:00:00.000Z'),
  issuer,
  taxpayerActivityCode: '4649',
  receiver: { type: 'P', name: 'عميل نقدي' },
  lines: [
    // 2 × 100 = 200, 10 discount → net 190, VAT 14% = 26.6, total 216.6
    { description: 'Item A', itemCodeType: 'EGS', itemCode: 'EG-1', internalCode: 'P001', unitType: 'EA', quantity: 2, unitPrice: 100, discountAmount: 10, taxRate: 14 },
    // 1 × 50 = 50, no discount, tax-exempt
    { description: 'Item B', itemCodeType: 'EGS', itemCode: 'EG-2', internalCode: 'P002', unitType: 'EA', quantity: 1, unitPrice: 50 },
  ],
};

describe('buildEtaDocument', () => {
  const doc = buildEtaDocument(sample);

  it('carries issuer/receiver/meta', () => {
    expect(doc.documentType).toBe('I');
    expect(doc.dateTimeIssued).toBe('2026-05-30T12:00:00Z');
    expect(doc.taxpayerActivityCode).toBe('4649');
    expect(doc.internalID).toBe('INV-001');
    expect(doc.issuer.id).toBe('123456789');
  });

  it('computes line totals (discount before tax)', () => {
    const [a, b] = doc.invoiceLines;
    expect(a.salesTotal).toBe(200);
    expect(a.netTotal).toBe(190);
    expect(a.taxableItems[0].amount).toBeCloseTo(26.6, 5);
    expect(a.total).toBeCloseTo(216.6, 5);
    expect(b.taxableItems).toHaveLength(0); // tax-exempt
    expect(b.total).toBe(50);
  });

  it('aggregates document totals', () => {
    expect(doc.totalSalesAmount).toBe(250);
    expect(doc.totalItemsDiscountAmount).toBe(10);
    expect(doc.netAmount).toBe(240);
    expect(doc.taxTotals[0].amount).toBeCloseTo(26.6, 5);
    expect(doc.totalAmount).toBeCloseTo(266.6, 5);
  });

  it('serializes deterministically for signing (upper-cased keys)', () => {
    const s = serializeForSignature({ internalID: 'X', taxTotals: [{ taxType: 'T1', amount: 1 }] });
    expect(s).toBe('"INTERNALID""X""TAXTOTALS""TAXTOTALS""TAXTYPE""T1""AMOUNT""1"');
  });
});
