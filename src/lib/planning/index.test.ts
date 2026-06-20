import { describe, it, expect } from 'vitest';
import * as planning from './index';

/** Guards the shared planning surface: every module must consume planning rules
 *  from @/lib/planning, so these re-exports must stay present. */
describe('shared planning engine surface', () => {
  it('exposes the core planning primitives', () => {
    for (const name of [
      'parseFrequency', 'frequencyToVisitsPerWeek', 'resolveVisitFrequency', 'customerWorkload',
      'workingDayList', 'balanceRoutes', 'resolveRouteCount', 'validateConstraints',
      'scopeCustomers', 'scopeOptions', 'initialScope',
      'applyScenario', 'scenarioMetrics', 'compareScenarios',
      'setAssignment', 'moveCustomer', 'reassignSalesman', 'reassignDay', 'currentPlanScenario',
    ] as const) {
      expect(typeof (planning as Record<string, unknown>)[name]).toBe('function');
    }
    expect(planning.BUSINESS_DOW.length).toBe(7);
  });
});
