import { describe, it, expect } from 'vitest';
import { buildEtaDocument, validateEtaDocument, EGYPT_ETA_PACK, type EtaDocInput } from './eta';

const baseInput: EtaDocInput = {
  documentType: 'I',
  internalId: 'INV-1001',
  dateTimeIssued: '2026-06-08T10:00:00Z',
  taxpayerActivityCode: '4690',
  issuer: { rin: '111111111', name: 'Seller LLC', governate: 'Cairo', regionCity: 'Maadi', street: 'St 9', buildingNumber: '10' },
  receiver: { rin: '222222222', name: 'Buyer LLC' },
  lines: [
    { description: 'Widget', itemCode: 'EG-1234', unitType: 'EA', quantity: 10, unitValue: 100, taxRate: 14 },
    { description: 'Gadget', itemCode: 'EG-5678', unitType: 'EA', quantity: 2, unitValue: 50, taxRate: 14, discount: 10 },
  ],
};

describe('Egypt ETA pack', () => {
  it('builds an ETA invoice document with correct totals (14% VAT)', () => {
    const doc = buildEtaDocument(baseInput);
    expect(doc.documentType).toBe('I');
    expect(doc.internalID).toBe('INV-1001');
    // line1: 10*100=1000 net, tax 140 ; line2: 100 sales -10 disc =90 net, tax 12.6
    expect(doc.totalSalesAmount).toBe(1100);
    expect(doc.totalDiscountAmount).toBe(10);
    expect(doc.netAmount).toBe(1090);
    expect(doc.taxTotals[0]).toEqual({ taxType: 'T1', amount: 152.6 });
    expect(doc.totalAmount).toBe(1242.6);
    expect(doc.invoiceLines[0].taxableItems[0]).toEqual({ taxType: 'T1', amount: 140, rate: 14 });
  });

  it('maps credit/debit document types', () => {
    expect(buildEtaDocument({ ...baseInput, documentType: 'C' }).documentType).toBe('C');
    expect(buildEtaDocument({ ...baseInput, documentType: 'D' }).documentType).toBe('D');
  });

  it('validates required ETA fields', () => {
    expect(validateEtaDocument(baseInput)).toEqual([]);
    const bad = validateEtaDocument({ ...baseInput, issuer: { rin: '', name: 'X' }, taxpayerActivityCode: '', lines: [{ description: 'x', itemCode: '', unitType: '', quantity: 0, unitValue: 1, taxRate: 14 }] });
    const fields = bad.map((i) => i.field);
    expect(fields).toContain('issuer.rin');
    expect(fields).toContain('taxpayerActivityCode');
    expect(fields).toContain('invoiceLines[0].itemCode');
    expect(fields).toContain('invoiceLines[0].unitType');
    expect(fields).toContain('invoiceLines[0].quantity');
  });

  it('requires a business receiver RIN', () => {
    const issues = validateEtaDocument({ ...baseInput, receiver: { rin: '', name: 'Walkin', type: 'B' } });
    expect(issues.map((i) => i.field)).toContain('receiver.rin');
  });

  it('declares ETA pack capabilities', () => {
    expect(EGYPT_ETA_PACK).toMatchObject({ country: 'EG', regime: 'eta' });
    expect(EGYPT_ETA_PACK.capabilities).toEqual(expect.arrayContaining(['e_invoice', 'e_receipt', 'digital_signature']));
  });
});
