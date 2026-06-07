import { describe, it, expect } from 'vitest';
import { summarizeTradeSpend } from './summary';

describe('trade-spend summary read-model', () => {
  it('rolls accrued/claimed/open-liability and cap utilisation', () => {
    const s = summarizeTradeSpend([
      { status: 'active', accrued: 5000, claimed: 2000, cap: 10000 },
      { status: 'active', accrued: 3000, claimed: 3000, cap: null },
      { status: 'closed', accrued: 1000, claimed: 0, cap: 2000 },
    ]);
    expect(s.promotions).toBe(3);
    expect(s.active).toBe(2);
    expect(s.totalAccrued).toBe(9000);
    expect(s.totalClaimed).toBe(5000);
    expect(s.openLiability).toBe(4000);
    // capped promos: accrued 5000+1000=6000 over caps 10000+2000=12000 → 50%
    expect(s.capUtilizationPct).toBe(50);
  });

  it('floors open liability at zero and handles no caps', () => {
    const s = summarizeTradeSpend([{ status: 'active', accrued: 100, claimed: 250, cap: null }]);
    expect(s.openLiability).toBe(0);
    expect(s.capUtilizationPct).toBe(0);
  });

  it('handles an empty portfolio', () => {
    expect(summarizeTradeSpend([])).toMatchObject({ promotions: 0, active: 0, totalAccrued: 0, openLiability: 0, capUtilizationPct: 0 });
  });
});
