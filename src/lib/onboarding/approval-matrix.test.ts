import { describe, it, expect } from 'vitest';
import {
  APPROVAL_SCENARIOS, scenarioByKey, tiersToStepRows, stepRowsToTiers, validateTiers,
  type MatrixTier,
} from './approval-matrix';

const tier = (approverRef: string, aboveAmount = 0): MatrixTier => ({
  approverType: 'role', approverRef, aboveAmount,
});

describe('approval-matrix pure helpers', () => {
  it('exposes a catalog bound to real engine scenarios', () => {
    expect(scenarioByKey('credit_limit_approval_v2')?.entity).toBe('credit_limit_request');
    expect(scenarioByKey('credit_limit_approval_v2')?.amountTiered).toBe(true);
    expect(scenarioByKey('customer_data_update')?.amountTiered).toBe(false);
    expect(APPROVAL_SCENARIOS.length).toBeGreaterThanOrEqual(5);
  });

  it('tiersToStepRows compiles cumulative escalation with gt thresholds', () => {
    const rows = tiersToStepRows(
      [tier('supervisor', 0), tier('accountant', 5000), tier('sales_director', 20000)],
      true,
    );
    expect(rows.map((r) => r.stepNo)).toEqual([1, 2, 3]);
    expect(rows[0].condition).toBeNull();                                  // always
    expect(rows[1].condition).toEqual({ when: 'amount', op: 'gt', value: '5000' });
    expect(rows[2].condition).toEqual({ when: 'amount', op: 'gt', value: '20000' });
    expect(rows.map((r) => r.approverRef)).toEqual(['supervisor', 'accountant', 'sales_director']);
  });

  it('tiersToStepRows sorts by amount and drops conditions for non-tiered scenarios', () => {
    const rows = tiersToStepRows([tier('a', 20000), tier('b', 0)], true);
    expect(rows.map((r) => r.approverRef)).toEqual(['b', 'a']);          // re-sorted asc
    const flat = tiersToStepRows([tier('branch_manager'), tier('supervisor')], false);
    expect(flat.every((r) => r.condition === null)).toBe(true);
  });

  it('company_admin approver carries no role ref', () => {
    const rows = tiersToStepRows([{ approverType: 'company_admin', approverRef: null, aboveAmount: 0 }], false);
    expect(rows[0].approverType).toBe('company_admin');
    expect(rows[0].approverRef).toBeNull();
  });

  it('stepRowsToTiers is the inverse of tiersToStepRows', () => {
    const steps = [
      { step_no: 1, approver_type: 'role', approver_ref: 'supervisor', condition: null },
      { step_no: 2, approver_type: 'role', approver_ref: 'accountant', condition: { when: 'amount', op: 'gt', value: '5000' } },
    ];
    const tiers = stepRowsToTiers(steps);
    expect(tiers).toEqual([
      { approverType: 'role', approverRef: 'supervisor', aboveAmount: 0 },
      { approverType: 'role', approverRef: 'accountant', aboveAmount: 5000 },
    ]);
  });

  it('validateTiers catches empty, missing approver, and duplicate thresholds', () => {
    expect(validateTiers([], true)).toContain('empty');
    expect(validateTiers([{ approverType: 'role', approverRef: null, aboveAmount: 0 }], false)).toContain('missing_approver');
    expect(validateTiers([tier('a', 5000), tier('b', 5000)], true)).toContain('duplicate_threshold');
    expect(validateTiers([tier('a', 0), tier('b', 5000)], true)).toEqual([]);
  });
});
