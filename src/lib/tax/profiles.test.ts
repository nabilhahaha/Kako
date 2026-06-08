import { describe, it, expect } from 'vitest';
import { DOCUMENT_TAX_PROFILES, getDocumentTaxProfile } from './profiles';

describe('document tax profile catalog', () => {
  it('defines exactly the 12 platform profiles', () => {
    expect(DOCUMENT_TAX_PROFILES).toHaveLength(12);
    expect(DOCUMENT_TAX_PROFILES.map((p) => p.code).sort()).toEqual([
      'credit_note', 'debit_note', 'exempt', 'non_tax_invoice', 'out_of_scope', 'receipt',
      'simplified_tax_invoice', 'tax_credit_note', 'tax_debit_note', 'tax_invoice', 'tax_receipt', 'zero_rated',
    ]);
  });

  it('marks taxable vs non-taxable correctly', () => {
    expect(getDocumentTaxProfile('tax_invoice')).toMatchObject({ isTaxable: true, taxKind: 'standard', complianceClass: 'e_invoice' });
    expect(getDocumentTaxProfile('non_tax_invoice')).toMatchObject({ isTaxable: false, taxKind: 'none' });
    expect(getDocumentTaxProfile('out_of_scope')).toMatchObject({ isTaxable: false, taxKind: 'out_of_scope' });
    expect(getDocumentTaxProfile('zero_rated')).toMatchObject({ isTaxable: true, taxKind: 'zero' });
    expect(getDocumentTaxProfile('exempt')).toMatchObject({ isTaxable: false, taxKind: 'exempt' });
  });

  it('flags notes + original-ref requirement', () => {
    for (const code of ['credit_note', 'debit_note', 'tax_credit_note', 'tax_debit_note']) {
      expect(getDocumentTaxProfile(code)).toMatchObject({ isNote: true, requiresOriginalRef: true });
    }
    expect(getDocumentTaxProfile('tax_invoice')!.isNote).toBe(false);
  });

  it('maps compliance classes (simplified / e_receipt)', () => {
    expect(getDocumentTaxProfile('simplified_tax_invoice')!.complianceClass).toBe('simplified');
    expect(getDocumentTaxProfile('tax_receipt')!.complianceClass).toBe('e_receipt');
  });

  it('returns undefined for an unknown code', () => {
    expect(getDocumentTaxProfile('nope')).toBeUndefined();
  });
});
