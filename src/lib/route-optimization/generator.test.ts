import { describe, it, expect } from 'vitest';
import { generateWeeklyPlan, type GenCustomer } from './generator';
import { DEFAULT_FREQUENCY_RULES } from './frequency';

const workingDays = ['sun', 'mon', 'tue', 'wed', 'thu'];
const at = (id: string, extra: Partial<GenCustomer> = {}): GenCustomer => ({
  customerId: id, latitude: 24.7 + Math.random() * 0.01, longitude: 46.6 + Math.random() * 0.01, classification: '', ...extra,
});

/** Count how many days a customer is scheduled across the week. */
function daysFor(plans: ReturnType<typeof generateWeeklyPlan>, id: string): number {
  return plans.filter((d) => d.customerIds.includes(id)).length;
}

describe('generateWeeklyPlan — FR-5 frequency precedence', () => {
  it('falls back to classification when no pre-resolved visitsPerWeek (today behaviour)', () => {
    const plans = generateWeeklyPlan([at('c', { classification: 'a' })], DEFAULT_FREQUENCY_RULES, workingDays);
    expect(daysFor(plans, 'c')).toBe(3); // A → 3 visits/week
  });

  it('pre-resolved visitsPerWeek overrides the classification rule', () => {
    // Grade A (3/week) but the customer-level value resolved to 1/week.
    const plans = generateWeeklyPlan([at('c', { classification: 'a', visitsPerWeek: 1 })], DEFAULT_FREQUENCY_RULES, workingDays);
    expect(daysFor(plans, 'c')).toBe(1);
  });

  it('a customer-level value can raise frequency above the grade too', () => {
    const plans = generateWeeklyPlan([at('c', { classification: 'c', visitsPerWeek: 3 })], DEFAULT_FREQUENCY_RULES, workingDays);
    expect(daysFor(plans, 'c')).toBe(3); // C grade is 1/week; override = 3
  });

  it('zero / null resolved frequency skips the customer', () => {
    const plans = generateWeeklyPlan([at('c', { classification: '', visitsPerWeek: 0 })], DEFAULT_FREQUENCY_RULES, workingDays);
    expect(daysFor(plans, 'c')).toBe(0);
  });
});
