import { describe, it, expect } from 'vitest';
import { setAssignment, moveCustomer, removeAssignment, cloneScenario, liveMetrics, currentPlanScenario } from './plan-edit';
import { balanceRoutes } from './optimize-routes';
import { buildJeddahDemoDataset } from './demo/jeddah';
import type { Scenario } from './scenario';

const ds = buildJeddahDemoDataset();

describe('VTP-1 edit ops (immutable)', () => {
  const base: Scenario = { id: 's', name: 'S', assignments: [{ customerId: 'JED-0001', routeId: 'R-1' }] };

  it('setAssignment upserts + merges without mutating the original', () => {
    const next = setAssignment(base, { customerId: 'JED-0001', salesmanId: 'sm-9' });
    expect(next.assignments[0]).toEqual({ customerId: 'JED-0001', routeId: 'R-1', salesmanId: 'sm-9' });
    expect(base.assignments[0]).toEqual({ customerId: 'JED-0001', routeId: 'R-1' }); // unchanged
    const added = setAssignment(base, { customerId: 'JED-0002', routeId: 'R-2' });
    expect(added.assignments).toHaveLength(2);
  });

  it('moveCustomer changes the route', () => {
    expect(moveCustomer(base, 'JED-0001', 'R-9').assignments[0].routeId).toBe('R-9');
  });

  it('removeAssignment drops the override', () => {
    expect(removeAssignment(base, 'JED-0001').assignments).toHaveLength(0);
  });

  it('cloneScenario deep-copies under a new id/name', () => {
    const c = cloneScenario(base, 'A', 'Scenario A');
    expect(c.id).toBe('A'); expect(c.assignments).toEqual(base.assignments);
    c.assignments[0].routeId = 'X';
    expect(base.assignments[0].routeId).toBe('R-1'); // independent copy
  });
});

describe('VTP-1 live metrics on the Jeddah demo', () => {
  it('a move updates the metrics (instant recompute)', () => {
    const seed = balanceRoutes(ds.customers, { routeCount: 6 });
    const scenario: Scenario = { id: 'opt', name: 'Optimized', assignments: seed.assignments };
    const before = liveMetrics(ds, scenario);
    expect(before.customers).toBe(500);
    expect(before.routeCount).toBe(6);
    expect(before.valueBalancePct).toBeGreaterThan(0);

    // Move all of route opt-route-1's customers onto opt-route-2 → fewer routes.
    let edited = scenario;
    for (const a of seed.assignments.filter((x) => x.routeId === 'opt-route-1')) edited = moveCustomer(edited, a.customerId, 'opt-route-2');
    const after = liveMetrics(ds, edited);
    expect(after.routeCount).toBe(5);
    expect(after.routeBalancePct).not.toBe(before.routeBalancePct); // balance changed
  });

  it('currentPlanScenario reflects existing ownership', () => {
    const cur = liveMetrics(ds, currentPlanScenario(ds));
    expect(cur.customers).toBe(500);
    expect(cur.routeCount).toBeGreaterThan(0);
  });
});
