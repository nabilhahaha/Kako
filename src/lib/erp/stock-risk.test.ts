import { describe, it, expect } from 'vitest';
import { stockStatus, summarizeStock, rankStock, DEFAULT_REORDER_POINT } from './stock-risk';

describe('stock-risk', () => {
  it('classifies out / low / ok', () => {
    expect(stockStatus(0)).toBe('out');
    expect(stockStatus(-3)).toBe('out');
    expect(stockStatus(5)).toBe('low'); // ≤ default 10
    expect(stockStatus(50)).toBe('ok');
    expect(stockStatus(8, 20)).toBe('low'); // custom reorder point
    expect(stockStatus(25, 20)).toBe('ok');
  });
  it('uses the default reorder point', () => {
    expect(stockStatus(DEFAULT_REORDER_POINT)).toBe('low');
    expect(stockStatus(DEFAULT_REORDER_POINT + 1)).toBe('ok');
  });
  it('summarizes', () => {
    const s = summarizeStock([{ available: 0 }, { available: 5 }, { available: 100 }, { available: 100 }]);
    expect(s).toEqual({ total: 4, ok: 2, low: 1, out: 1 });
  });
  it('ranks risk-first (out → low → ok, then lowest qty)', () => {
    const r = rankStock([{ available: 100 }, { available: 0 }, { available: 3 }, { available: 8 }]);
    expect(r.map((x) => x.available)).toEqual([0, 3, 8, 100]);
  });
});
