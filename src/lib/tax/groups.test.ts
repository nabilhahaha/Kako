import { describe, it, expect } from 'vitest';
import { computeGroupedTax, type TaxGroup } from './groups';
import type { TaxCodeRef } from './vat';

const vat15: TaxCodeRef = { code: 'VAT_15', rate: 15, kind: 'standard' };
const excise10: TaxCodeRef = { code: 'EXCISE_10', rate: 10, kind: 'standard' };

describe('tax groups / multi-rate', () => {
  it('non-compound: both members apply to the same base; net counted once', () => {
    const group: TaxGroup = { code: 'VAT+EXC', members: [excise10, vat15] };
    const r = computeGroupedTax([{ amount: 1000, group }]);
    expect(r.net).toBe(1000); // counted once, not per component
    expect(r.taxByCode.EXCISE_10).toBe(100); // 1000*10%
    expect(r.taxByCode.VAT_15).toBe(150);    // 1000*15%
    expect(r.totalTax).toBe(250);
    expect(r.gross).toBe(1250);
    expect(r.lines).toHaveLength(2);
  });

  it('compound: VAT applies on base + prior excise (tax-on-tax)', () => {
    const group: TaxGroup = { code: 'EXC then VAT', members: [excise10, vat15], compound: true };
    const r = computeGroupedTax([{ amount: 1000, group }]);
    // excise 100; VAT base = 1100 → 165
    expect(r.taxByCode.EXCISE_10).toBe(100);
    expect(r.taxByCode.VAT_15).toBe(165);
    expect(r.totalTax).toBe(265);
    expect(r.gross).toBe(1265);
    expect(r.lines[1].base).toBe(1100);
  });

  it('aggregates across multiple grouped lines', () => {
    const group: TaxGroup = { code: 'VAT', members: [vat15] };
    const r = computeGroupedTax([{ amount: 100, group }, { amount: 200, group }]);
    expect(r.net).toBe(300);
    expect(r.taxByCode.VAT_15).toBe(45);
  });

  it('handles a zero-rated member (reportable, 0 tax)', () => {
    const group: TaxGroup = { code: 'VAT+ZERO', members: [vat15, { code: 'ZERO', rate: 0, kind: 'zero' }] };
    const r = computeGroupedTax([{ amount: 500, group }]);
    expect(r.taxByCode.VAT_15).toBe(75);
    expect(r.taxByCode.ZERO).toBe(0);
    expect(r.totalTax).toBe(75);
  });

  it('signed (credit note) grouped line', () => {
    const group: TaxGroup = { code: 'VAT', members: [vat15] };
    const r = computeGroupedTax([{ amount: -200, group }]);
    expect(r.net).toBe(-200);
    expect(r.totalTax).toBe(-30);
  });
});
