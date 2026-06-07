import { describe, it, expect } from 'vitest';
import { computeTax, applyNoteAdjustment, type TaxCodeRef } from './vat';

const std = (rate: number): TaxCodeRef => ({ code: `VAT_${rate}`, rate, kind: 'standard' });
const zero: TaxCodeRef = { code: 'ZERO', rate: 0, kind: 'zero' };
const exempt: TaxCodeRef = { code: 'EXEMPT', rate: 0, kind: 'exempt' };
const oos: TaxCodeRef = { code: 'OOS', rate: 0, kind: 'out_of_scope' };
const rc: TaxCodeRef = { code: 'RC', rate: 15, kind: 'reverse_charge' };

describe('VAT calculation engine', () => {
  describe('exclusive (net) amounts', () => {
    it('computes tax on the net base', () => {
      const r = computeTax([{ amount: 1000, taxCode: std(15) }]);
      expect(r).toMatchObject({ net: 1000, totalTax: 150, gross: 1150 });
      expect(r.lines[0]).toMatchObject({ base: 1000, taxAmount: 150, rate: 15, kind: 'standard' });
      expect(r.taxByCode.VAT_15).toBe(150);
    });
    it('Egypt 14% example', () => {
      expect(computeTax([{ amount: 500, taxCode: std(14) }])).toMatchObject({ net: 500, totalTax: 70, gross: 570 });
    });
  });

  describe('inclusive (gross) amounts', () => {
    it('extracts tax from the gross', () => {
      // gross 1150 @15% → tax 150, base 1000
      const r = computeTax([{ amount: 1150, taxCode: std(15) }], { inclusive: true });
      expect(r.lines[0].taxAmount).toBe(150);
      expect(r.lines[0].base).toBe(1000);
      expect(r.gross).toBe(1150);
    });
  });

  describe('kinds', () => {
    it('zero-rated: 0 tax but base reportable', () => {
      const r = computeTax([{ amount: 800, taxCode: zero }]);
      expect(r).toMatchObject({ net: 800, totalTax: 0, gross: 800 });
      expect(r.lines[0].kind).toBe('zero');
    });
    it('exempt and out-of-scope: no tax', () => {
      expect(computeTax([{ amount: 800, taxCode: exempt }]).totalTax).toBe(0);
      expect(computeTax([{ amount: 800, taxCode: oos }]).totalTax).toBe(0);
    });
    it('reverse charge: no on-document tax (notional, ledgered later)', () => {
      const r = computeTax([{ amount: 1000, taxCode: rc }]);
      expect(r.totalTax).toBe(0);
      expect(r.gross).toBe(1000);
    });
  });

  describe('multi-line + rounding', () => {
    it('aggregates per code and totals', () => {
      const r = computeTax([
        { amount: 100, taxCode: std(15) },
        { amount: 200, taxCode: std(15) },
        { amount: 50, taxCode: zero },
      ]);
      expect(r.net).toBe(350);
      expect(r.taxByCode.VAT_15).toBe(45); // (100+200)*15%
      expect(r.totalTax).toBe(45);
      expect(r.gross).toBe(395);
    });
    it('per-line vs per-invoice rounding differ on fractional cents', () => {
      // two lines each 10.10 @15% = 1.515 → line rounds to 1.52 each → 3.04;
      // invoice rounds 3.03 once → 3.03
      const lines = [{ amount: 10.1, taxCode: std(15) }, { amount: 10.1, taxCode: std(15) }];
      expect(computeTax(lines, { rounding: 'line' }).totalTax).toBe(3.04);
      expect(computeTax(lines, { rounding: 'invoice' }).totalTax).toBe(3.03);
    });
  });

  describe('credit/debit notes (signed)', () => {
    it('credit note produces negative tax on the delta', () => {
      const r = applyNoteAdjustment(std(15), -200);
      expect(r.lines[0].base).toBe(-200);
      expect(r.totalTax).toBe(-30);
      expect(r.gross).toBe(-230);
    });
    it('debit note produces positive tax on the delta', () => {
      expect(applyNoteAdjustment(std(15), 200).totalTax).toBe(30);
    });
  });
});
