import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { assessDocumentTax } from './service';
import type { TaxGateway, TaxDocLineWrite, TaxLedgerWrite } from './gateway';
import type { DeterminationRule } from './determine';

function makeGateway(rules: DeterminationRule[], opts?: { assessed?: boolean }) {
  const docLines: TaxDocLineWrite[] = [];
  const ledger: TaxLedgerWrite[] = [];
  let assessed = opts?.assessed ?? false;
  const gw: TaxGateway = {
    async loadDeterminationRules() { return rules; },
    async resolveProfileId(_c, code) { return `prof-${code}`; },
    async saveTaxDocumentLines(l) { docLines.push(...l); },
    async saveTaxLedger(e) { ledger.push(...e); assessed = true; },
    async hasAssessment() { return assessed; },
  };
  return { gw, docLines, ledger };
}

const ksaB2b: DeterminationRule = {
  id: 'ksa-b2b', priority: 100, country: 'SA', customerType: 'b2b', documentType: 'sales_invoice',
  profileCode: 'tax_invoice', vatTreatment: 'standard', taxCode: 'SA_VAT_15', taxRate: 15,
  complianceRequirement: 'e_invoice', countryPack: 'zatca', reportingCategory: 'standard_rated',
};

describe('tax service (assess document tax)', () => {
  beforeEach(() => { process.env.KAKO_TAX = '1'; });
  afterEach(() => { delete process.env.KAKO_TAX; });

  const base = {
    companyId: 'c1', legalEntityId: 'le1', registrationId: 'reg1',
    context: { country: 'SA', customerType: 'b2b', documentType: 'sales_invoice' },
    lines: [{ amount: 1000 }, { amount: 500 }], period: '2026-06',
    referenceType: 'invoice', referenceId: 'inv-1', asOf: '2026-06-08',
  };

  it('no-op when KAKO_TAX off', async () => {
    delete process.env.KAKO_TAX;
    const f = makeGateway([ksaB2b]);
    expect(await assessDocumentTax(f.gw, base)).toEqual({ assessed: false, reason: 'disabled' });
  });

  it('determines KSA B2B → tax_invoice 15%, computes + persists lines + ledger', async () => {
    const f = makeGateway([ksaB2b]);
    const r = await assessDocumentTax(f.gw, base);
    expect(r).toMatchObject({ assessed: true, profileCode: 'tax_invoice', taxCode: 'SA_VAT_15', net: 1500, totalTax: 225 });
    expect(f.docLines).toHaveLength(2);
    expect(f.docLines[0]).toMatchObject({ taxCode: 'SA_VAT_15', rate: 15, documentTaxProfileId: 'prof-tax_invoice' });
    expect(f.ledger).toHaveLength(1);
    expect(f.ledger[0]).toMatchObject({ direction: 'output', taxCode: 'SA_VAT_15', base: 1500, tax: 225, reportingCategory: 'standard_rated', legalEntityId: 'le1', registrationId: 'reg1' });
  });

  it('zero-rated export determination → 0 tax, base reportable', async () => {
    const exportRule: DeterminationRule = { id: 'exp', priority: 50, transactionType: 'export', profileCode: 'zero_rated', vatTreatment: 'zero', taxRate: 0, reportingCategory: 'exports' };
    const f = makeGateway([exportRule]);
    const r = await assessDocumentTax(f.gw, { ...base, context: { transactionType: 'export' } });
    expect(r).toMatchObject({ assessed: true, profileCode: 'zero_rated', totalTax: 0 });
    expect(f.ledger[0]).toMatchObject({ tax: 0, base: 1500 });
  });

  it('skips when already assessed (idempotent)', async () => {
    const f = makeGateway([ksaB2b], { assessed: true });
    expect(await assessDocumentTax(f.gw, base)).toEqual({ assessed: false, reason: 'already_assessed' });
  });

  it('no rule → not assessed', async () => {
    const f = makeGateway([ksaB2b]);
    expect(await assessDocumentTax(f.gw, { ...base, context: { country: 'XX' } })).toEqual({ assessed: false, reason: 'no_rule' });
  });

  it('empty document → no_lines', async () => {
    const f = makeGateway([ksaB2b]);
    expect(await assessDocumentTax(f.gw, { ...base, lines: [] })).toEqual({ assessed: false, reason: 'no_lines' });
  });
});
