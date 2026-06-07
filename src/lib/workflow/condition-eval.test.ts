import { describe, it, expect } from 'vitest';
import { evalCondition } from './condition-eval';

describe('evalCondition', () => {
  it('empty/undefined condition is always true', () => {
    expect(evalCondition({}, {})).toBe(true);
    expect(evalCondition(null, {})).toBe(true);
  });

  it('leaf operators', () => {
    const v = { amount: 100, status: 'issued', tags: ['vip'] };
    expect(evalCondition({ field: 'amount', op: 'gt', value: 50 }, v)).toBe(true);
    expect(evalCondition({ field: 'amount', op: 'gte', value: 100 }, v)).toBe(true);
    expect(evalCondition({ field: 'amount', op: 'lt', value: 100 }, v)).toBe(false);
    expect(evalCondition({ field: 'status', op: 'eq', value: 'issued' }, v)).toBe(true);
    expect(evalCondition({ field: 'status', op: 'ne', value: 'paid' }, v)).toBe(true);
    expect(evalCondition({ field: 'status', op: 'in', value: ['issued', 'paid'] }, v)).toBe(true);
    expect(evalCondition({ field: 'missing', op: 'exists' }, v)).toBe(false);
    expect(evalCondition({ field: 'amount', op: 'exists' }, v)).toBe(true);
    expect(evalCondition({ field: 'status', op: 'truthy' }, v)).toBe(true);
  });

  it('coerces JSONB string/number for comparison', () => {
    expect(evalCondition({ field: 'amount', op: 'eq', value: 100 }, { amount: '100' })).toBe(true);
    expect(evalCondition({ field: 'amount', op: 'gt', value: 50 }, { amount: '100' })).toBe(true);
  });

  it('dot-path resolution', () => {
    expect(evalCondition({ field: 'customer.credit_limit', op: 'gt', value: 0 }, { customer: { credit_limit: 5000 } })).toBe(true);
  });

  it('all / any / not combinators', () => {
    const v = { a: 1, b: 2 };
    expect(evalCondition({ all: [{ field: 'a', op: 'eq', value: 1 }, { field: 'b', op: 'eq', value: 2 }] }, v)).toBe(true);
    expect(evalCondition({ all: [{ field: 'a', op: 'eq', value: 1 }, { field: 'b', op: 'eq', value: 9 }] }, v)).toBe(false);
    expect(evalCondition({ any: [{ field: 'a', op: 'eq', value: 9 }, { field: 'b', op: 'eq', value: 2 }] }, v)).toBe(true);
    expect(evalCondition({ not: { field: 'a', op: 'eq', value: 9 } }, v)).toBe(true);
  });
});
