import { describe, it, expect } from 'vitest';
import { isPdfDoc, printPathFor, pdfFilename, PDF_DOCS } from './documents';

describe('pdf documents (pure mapping)', () => {
  it('recognizes the supported document types only', () => {
    expect(PDF_DOCS).toEqual(['invoice', 'collection', 'return', 'statement']);
    expect(isPdfDoc('invoice')).toBe(true);
    expect(isPdfDoc('statement')).toBe(true);
    expect(isPdfDoc('receipt')).toBe(false);
  });

  it('maps each document to its print page (same template as Print)', () => {
    expect(printPathFor('invoice', 'abc')).toBe('/print/invoices/abc');
    expect(printPathFor('collection', 'abc')).toBe('/print/collection/abc');
    expect(printPathFor('return', 'abc')).toBe('/sales/returns/abc/print');
    expect(printPathFor('statement', 'abc')).toBe('/print/statement/abc');
  });

  describe('pdfFilename', () => {
    it('keeps a clean document number and appends .pdf', () => {
      expect(pdfFilename('INV-PILOT-000044', 'id1')).toBe('INV-PILOT-000044.pdf');
      expect(pdfFilename('COL-PILOT-000027.pdf', 'id1')).toBe('COL-PILOT-000027.pdf');
    });
    it('sanitizes unsafe characters', () => {
      expect(pdfFilename('RET 015/أ', 'id1')).toBe('RET-015.pdf');
    });
    it('falls back to the id when no usable name', () => {
      expect(pdfFilename('', 'id9')).toBe('DOC-id9.pdf');
      expect(pdfFilename(null, 'id9')).toBe('DOC-id9.pdf');
    });
  });
});
