import { describe, it, expect } from 'vitest';
import { allocatePayment } from './allocation';

const invs = [
  { id: 'A', outstanding: 100, date: '2026-01-01' },
  { id: 'B', outstanding: 50, date: '2026-02-01' },
  { id: 'C', outstanding: 80, date: '2026-03-01' },
];

describe('collection allocation engine', () => {
  describe('oldest-first', () => {
    it('settles whole invoices oldest-first until the amount runs out', () => {
      const r = allocatePayment(150, invs);
      expect(r.allocations).toEqual([
        { invoiceId: 'A', applied: 100 },
        { invoiceId: 'B', applied: 50 },
      ]);
      expect(r.fullySettled).toEqual(['A', 'B']);
      expect(r.totalApplied).toBe(150);
      expect(r.unapplied).toBe(0);
    });

    it('applies a partial payment to the last invoice', () => {
      const r = allocatePayment(120, invs);
      expect(r.allocations).toEqual([
        { invoiceId: 'A', applied: 100 },
        { invoiceId: 'B', applied: 20 },
      ]);
      expect(r.fullySettled).toEqual(['A']); // B only partially paid
      expect(r.unapplied).toBe(0);
    });

    it('returns overpayment as unapplied (on-account), never lost', () => {
      const r = allocatePayment(300, invs); // total outstanding 230
      expect(r.totalApplied).toBe(230);
      expect(r.unapplied).toBe(70);
      expect(r.fullySettled).toEqual(['A', 'B', 'C']);
    });

    it('orders strictly by date regardless of input order', () => {
      const shuffled = [invs[2], invs[0], invs[1]];
      const r = allocatePayment(100, shuffled);
      expect(r.allocations).toEqual([{ invoiceId: 'A', applied: 100 }]);
    });

    it('ignores already-settled invoices (outstanding <= 0)', () => {
      const r = allocatePayment(100, [{ id: 'Z', outstanding: 0, date: '2025-01-01' }, ...invs]);
      expect(r.allocations[0]).toEqual({ invoiceId: 'A', applied: 100 });
    });

    it('handles zero / negative amounts safely', () => {
      expect(allocatePayment(0, invs)).toMatchObject({ totalApplied: 0, unapplied: 0, allocations: [] });
      expect(allocatePayment(-50, invs)).toMatchObject({ totalApplied: 0, unapplied: 0 });
    });
  });

  describe('specified amounts', () => {
    it('applies caller-specified per-invoice amounts', () => {
      const r = allocatePayment(130, invs, { specified: { A: 100, C: 30 } });
      expect(r.allocations).toEqual([
        { invoiceId: 'A', applied: 100 },
        { invoiceId: 'C', applied: 30 },
      ]);
      expect(r.fullySettled).toEqual(['A']);
      expect(r.unapplied).toBe(0);
    });

    it('clamps a specified amount to the invoice outstanding (never over-apply)', () => {
      const r = allocatePayment(500, invs, { specified: { B: 999 } });
      expect(r.allocations).toEqual([{ invoiceId: 'B', applied: 50 }]);
      expect(r.fullySettled).toEqual(['B']);
      expect(r.unapplied).toBe(450);
    });

    it('clamps total to the collection amount (never over-allocate)', () => {
      const r = allocatePayment(120, invs, { specified: { A: 100, C: 80 } });
      expect(r.totalApplied).toBe(120);            // A:100 then C clamped to remaining 20
      expect(r.allocations).toEqual([
        { invoiceId: 'A', applied: 100 },
        { invoiceId: 'C', applied: 20 },
      ]);
      expect(r.unapplied).toBe(0);
    });

    it('skips unknown invoice ids', () => {
      const r = allocatePayment(100, invs, { specified: { NOPE: 50, A: 50 } });
      expect(r.allocations).toEqual([{ invoiceId: 'A', applied: 50 }]);
    });
  });
});
