import { describe, it, expect } from 'vitest';
import { avgReceipt, avgIssue, fifoReceipt, fifoIssue, standardValue } from './engine';
import { InsufficientStockError, type CostLayer } from './types';

describe('inventory costing engine', () => {
  describe('weighted (moving) average', () => {
    it('recomputes average on receipt', () => {
      let s = { qty: 0, avgCost: 0 };
      s = avgReceipt(s, 10, 5);          // 10 @ 5
      expect(s).toEqual({ qty: 10, avgCost: 5 });
      s = avgReceipt(s, 10, 7);          // +10 @ 7 → avg 6
      expect(s).toEqual({ qty: 20, avgCost: 6 });
    });

    it('values issue at current average; average unchanged', () => {
      const { cost, state } = avgIssue({ qty: 20, avgCost: 6 }, 5);
      expect(cost).toBe(30);
      expect(state).toEqual({ qty: 15, avgCost: 6 });
    });

    it('throws on issue exceeding quantity (no fabricated cost)', () => {
      expect(() => avgIssue({ qty: 3, avgCost: 6 }, 5)).toThrow(InsufficientStockError);
    });
  });

  describe('FIFO', () => {
    const layers: CostLayer[] = [{ qty: 10, unitCost: 5 }, { qty: 10, unitCost: 7 }];

    it('appends a layer on receipt', () => {
      expect(fifoReceipt(layers, 5, 8)).toHaveLength(3);
    });

    it('consumes oldest layers first', () => {
      const { cost, state } = fifoIssue(layers, 15); // 10@5 + 5@7 = 85
      expect(cost).toBe(85);
      expect(state).toEqual([{ qty: 5, unitCost: 7 }]);
    });

    it('consumes a whole layer exactly', () => {
      const { cost, state } = fifoIssue(layers, 10);
      expect(cost).toBe(50);
      expect(state).toEqual([{ qty: 10, unitCost: 7 }]);
    });

    it('throws when issue exceeds total available', () => {
      expect(() => fifoIssue(layers, 25)).toThrow(InsufficientStockError);
    });
  });

  describe('standard cost', () => {
    it('values at standard and computes purchase-price variance', () => {
      expect(standardValue(10, 5, 6)).toEqual({ cost: 50, priceVariance: 10 });   // actual > std
      expect(standardValue(10, 5, 4)).toEqual({ cost: 50, priceVariance: -10 });  // actual < std
      expect(standardValue(10, 5, 5)).toEqual({ cost: 50, priceVariance: 0 });
    });
  });
});
