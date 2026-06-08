import { describe, it, expect } from 'vitest';
import { buildZatcaInvoice, generateZatcaTlvQr, zatcaQrFromInvoice, validateZatcaInvoice, SAUDI_ZATCA_PACK, type ZatcaInvoiceInput } from './zatca';

const base: ZatcaInvoiceInput = {
  invoiceType: 'simplified',
  invoiceNumber: 'INV-001',
  issueDateTime: '2026-06-08T10:00:00Z',
  sellerName: 'Seller Co',
  sellerVatNumber: '300000000000003',
  lines: [
    { description: 'A', quantity: 2, unitPrice: 100, taxRate: 15 },
    { description: 'B', quantity: 1, unitPrice: 50, taxRate: 15 },
  ],
};

describe('Saudi ZATCA pack', () => {
  it('normalizes the invoice with 15% VAT totals', () => {
    const inv = buildZatcaInvoice(base);
    expect(inv.taxExclusiveAmount).toBe(250);
    expect(inv.vatTotal).toBe(37.5);
    expect(inv.taxInclusiveAmount).toBe(287.5);
    expect(inv.lines[0]).toMatchObject({ net: 200, vat: 30, total: 230 });
  });

  it('generates a deterministic Base64 TLV QR with tags 1..5', () => {
    const qr = generateZatcaTlvQr({ sellerName: 'Seller Co', sellerVatNumber: '300000000000003', timestamp: '2026-06-08T10:00:00Z', invoiceTotal: '287.50', vatTotal: '37.50' });
    expect(qr).toBe(zatcaQrFromInvoice(buildZatcaInvoice(base)));
    // decode + verify TLV structure: first byte tag=1, second byte = len of seller name
    const buf = Buffer.from(qr, 'base64');
    expect(buf[0]).toBe(1);
    expect(buf[1]).toBe(Buffer.from('Seller Co', 'utf8').length);
    const sellerName = buf.subarray(2, 2 + buf[1]).toString('utf8');
    expect(sellerName).toBe('Seller Co');
    // walk to tag 2 (VAT number)
    const idx2 = 2 + buf[1];
    expect(buf[idx2]).toBe(2);
  });

  it('validates simplified vs standard (B2B requires buyer VAT)', () => {
    expect(validateZatcaInvoice(base)).toEqual([]);
    const std = validateZatcaInvoice({ ...base, invoiceType: 'standard' });
    expect(std.map((i) => i.field)).toContain('buyerVatNumber');
    expect(validateZatcaInvoice({ ...base, invoiceType: 'standard', buyerVatNumber: '311111111111113' })).toEqual([]);
  });

  it('rejects a malformed seller VAT number', () => {
    expect(validateZatcaInvoice({ ...base, sellerVatNumber: '123' }).map((i) => i.field)).toContain('sellerVatNumber');
  });

  it('declares ZATCA pack capabilities (clearance + reporting + qr)', () => {
    expect(SAUDI_ZATCA_PACK).toMatchObject({ country: 'SA', regime: 'zatca', version: '2.0.0' });
    expect(SAUDI_ZATCA_PACK.capabilities).toEqual(expect.arrayContaining(['clearance', 'reporting', 'qr', 'digital_signature']));
  });
});
