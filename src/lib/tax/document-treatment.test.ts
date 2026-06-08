import { describe, it, expect } from 'vitest';
import { resolveDocumentTaxProfile, type DocTreatmentRule } from './document-treatment';

const r = (id: string, o: Partial<DocTreatmentRule>): DocTreatmentRule =>
  ({ id, profileCode: o.profileCode ?? 'tax_invoice', priority: o.priority ?? 100, ...o });

describe('document tax treatment resolver (cascade)', () => {
  const asOf = '2026-06-08';

  it('most-specific wins: document_type beats customer beats company default', () => {
    const rules = [
      r('company', { profileCode: 'tax_invoice' }),                                  // company-wide default
      r('cust', { customerId: 'C1', profileCode: 'non_tax_invoice' }),               // customer
      r('doctype', { customerId: 'C1', documentType: 'receipt', profileCode: 'tax_receipt' }), // customer + doctype
    ];
    expect(resolveDocumentTaxProfile(rules, { customerId: 'C1', documentType: 'receipt' }, asOf)!.profileCode).toBe('tax_receipt');
    expect(resolveDocumentTaxProfile(rules, { customerId: 'C1', documentType: 'invoice' }, asOf)!.profileCode).toBe('non_tax_invoice');
    expect(resolveDocumentTaxProfile(rules, { customerId: 'C9', documentType: 'invoice' }, asOf)!.profileCode).toBe('tax_invoice');
  });

  it('same customer, same day, different document types resolve independently (no conflict)', () => {
    const rules = [
      r('a', { customerId: 'C1', documentType: 'tax_invoice', profileCode: 'tax_invoice' }),
      r('b', { customerId: 'C1', documentType: 'service', profileCode: 'non_tax_invoice' }),
      r('c', { customerId: 'C1', documentType: 'credit', profileCode: 'tax_credit_note' }),
    ];
    expect(resolveDocumentTaxProfile(rules, { customerId: 'C1', documentType: 'tax_invoice' }, asOf)!.profileCode).toBe('tax_invoice');
    expect(resolveDocumentTaxProfile(rules, { customerId: 'C1', documentType: 'service' }, asOf)!.profileCode).toBe('non_tax_invoice');
    expect(resolveDocumentTaxProfile(rules, { customerId: 'C1', documentType: 'credit' }, asOf)!.profileCode).toBe('tax_credit_note');
  });

  it('a per-document override wins over all rules', () => {
    const rules = [r('company', { profileCode: 'tax_invoice' })];
    const res = resolveDocumentTaxProfile(rules, { customerId: 'C1' }, asOf, 'out_of_scope');
    expect(res).toEqual({ profileCode: 'out_of_scope', ruleId: null, specificity: -1 });
  });

  it('is effective-dated (as-of the tax point)', () => {
    const rules = [
      r('old', { profileCode: 'tax_invoice', effectiveTo: '2026-06-30' }),
      r('new', { profileCode: 'simplified_tax_invoice', effectiveFrom: '2026-07-01' }),
    ];
    expect(resolveDocumentTaxProfile(rules, {}, '2026-06-15')!.profileCode).toBe('tax_invoice');
    expect(resolveDocumentTaxProfile(rules, {}, '2026-07-15')!.profileCode).toBe('simplified_tax_invoice');
  });

  it('priority breaks ties at equal specificity', () => {
    const rules = [
      r('p100', { customerId: 'C1', profileCode: 'tax_invoice', priority: 100 }),
      r('p10', { customerId: 'C1', profileCode: 'non_tax_invoice', priority: 10 }),
    ];
    expect(resolveDocumentTaxProfile(rules, { customerId: 'C1' }, asOf)!.profileCode).toBe('non_tax_invoice');
  });

  it('returns null when nothing matches', () => {
    expect(resolveDocumentTaxProfile([r('cust', { customerId: 'C1' })], { customerId: 'C2' }, asOf)).toBeNull();
  });
});
