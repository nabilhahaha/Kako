import { describe, it, expect } from 'vitest';
import { buildVatReturn, type TaxLedgerEntry } from './report';

describe('VAT return builder', () => {
  it('nets output − input into payable', () => {
    const entries: TaxLedgerEntry[] = [
      { direction: 'output', taxCode: 'VAT_15', base: 10000, tax: 1500 },
      { direction: 'output', taxCode: 'VAT_15', base: 2000, tax: 300 },
      { direction: 'input', taxCode: 'VAT_15', base: 4000, tax: 600 },
    ];
    const r = buildVatReturn(entries);
    expect(r.outputTax).toBe(1800);
    expect(r.inputTax).toBe(600);
    expect(r.netPayable).toBe(1200);
    expect(r.outputBase).toBe(12000);
    expect(r.byCode['output:VAT_15']).toEqual({ direction: 'output', base: 12000, tax: 1800 });
    expect(r.byCode['input:VAT_15']).toEqual({ direction: 'input', base: 4000, tax: 600 });
  });

  it('negative net payable = refund position', () => {
    const r = buildVatReturn([
      { direction: 'output', taxCode: 'VAT_15', base: 1000, tax: 150 },
      { direction: 'input', taxCode: 'VAT_15', base: 4000, tax: 600 },
    ]);
    expect(r.netPayable).toBe(-450);
  });

  it('zero-rated/exempt contribute base but no tax', () => {
    const r = buildVatReturn([
      { direction: 'output', taxCode: 'ZERO', base: 5000, tax: 0, kind: 'zero' },
      { direction: 'output', taxCode: 'VAT_15', base: 1000, tax: 150 },
    ]);
    expect(r.outputTax).toBe(150);
    expect(r.outputBase).toBe(6000);
  });

  it('empty period', () => {
    expect(buildVatReturn([])).toMatchObject({ outputTax: 0, inputTax: 0, netPayable: 0 });
  });
});
