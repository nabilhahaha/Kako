import { describe, it, expect } from 'vitest';
import { computeAccrual } from './accrual';

describe('trade-spend accrual engine', () => {
  describe('percent_of_sales', () => {
    it('accrues a percentage of sales value', () => {
      expect(computeAccrual({ method: 'percent_of_sales', percent: 5 }, { salesValue: 1000, units: 0 }))
        .toMatchObject({ accrued: 50, uncapped: 50, capped: false });
    });
  });

  describe('rate_per_unit', () => {
    it('accrues a rate per case/unit', () => {
      expect(computeAccrual({ method: 'rate_per_unit', rate: 2.5 }, { salesValue: 0, units: 120 }))
        .toMatchObject({ accrued: 300, capped: false });
    });
  });

  describe('lump_sum', () => {
    it('books the full lump sum the first time', () => {
      expect(computeAccrual({ method: 'lump_sum', lumpSum: 5000 }, { salesValue: 0, units: 0 }, 0))
        .toMatchObject({ accrued: 5000 });
    });
    it('does not re-accrue once anything is already booked', () => {
      expect(computeAccrual({ method: 'lump_sum', lumpSum: 5000 }, { salesValue: 0, units: 0 }, 5000))
        .toMatchObject({ accrued: 0 });
    });
  });

  describe('cap (cumulative)', () => {
    it('clamps the period accrual so prior + new never exceeds the cap', () => {
      // prior 8000, cap 10000 → headroom 2000; uncapped 5% of 100000 = 5000 → clamp 2000
      const r = computeAccrual({ method: 'percent_of_sales', percent: 5, cap: 10000 }, { salesValue: 100000, units: 0 }, 8000);
      expect(r).toMatchObject({ accrued: 2000, uncapped: 5000, capped: true });
    });
    it('accrues nothing when the cap is already reached', () => {
      const r = computeAccrual({ method: 'rate_per_unit', rate: 1, cap: 1000 }, { salesValue: 0, units: 500 }, 1000);
      expect(r).toMatchObject({ accrued: 0, capped: true });
    });
    it('does not clamp when under the cap', () => {
      const r = computeAccrual({ method: 'percent_of_sales', percent: 5, cap: 10000 }, { salesValue: 20000, units: 0 }, 0);
      expect(r).toMatchObject({ accrued: 1000, capped: false });
    });
  });

  describe('data integrity', () => {
    it('never returns a negative accrual (guards bad inputs)', () => {
      expect(computeAccrual({ method: 'percent_of_sales', percent: -5 }, { salesValue: -1000, units: 0 }).accrued).toBe(0);
      expect(computeAccrual({ method: 'rate_per_unit', rate: 2 }, { salesValue: 0, units: -10 }).accrued).toBe(0);
    });
    it('rounds to 2 decimals', () => {
      expect(computeAccrual({ method: 'percent_of_sales', percent: 3.33 }, { salesValue: 1000, units: 0 }).accrued).toBe(33.3);
    });
  });
});
