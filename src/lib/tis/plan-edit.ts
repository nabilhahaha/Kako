/**
 * Visual Territory Planning — scenario edit operations (VTP-1). Pure, no I/O.
 * Immutable upsert/move/remove/clone over a TIS-0 `Scenario`, plus a live-metrics
 * helper. Each edit appends/updates a `ScenarioAssignment`; metrics recompute via
 * the existing `scenarioMetrics`, so the planning board (VTP-2) recalculates
 * instantly client-side with zero new logic.
 */
import { scenarioMetrics, applyScenario, type Scenario, type ScenarioAssignment, type ScenarioMetrics } from './scenario';
import type { TisDataset } from './dataset';

/** Upsert an assignment (merge fields) by customerId. Pure, immutable. */
export function setAssignment(scenario: Scenario, assignment: ScenarioAssignment): Scenario {
  const i = scenario.assignments.findIndex((a) => a.customerId === assignment.customerId);
  const next = [...scenario.assignments];
  if (i >= 0) next[i] = { ...next[i], ...assignment };
  else next.push(assignment);
  return { ...scenario, assignments: next };
}

/** Move a customer to a route (shortcut over setAssignment). Pure. */
export function moveCustomer(scenario: Scenario, customerId: string, routeId: string | null): Scenario {
  return setAssignment(scenario, { customerId, routeId });
}

/** Set a customer's salesman. Pure. */
export function reassignSalesman(scenario: Scenario, customerId: string, salesmanId: string | null): Scenario {
  return setAssignment(scenario, { customerId, salesmanId });
}

/** Set a customer's visit day. Pure. */
export function reassignDay(scenario: Scenario, customerId: string, dayOfWeek: string | null): Scenario {
  return setAssignment(scenario, { customerId, dayOfWeek });
}

/** Drop a customer's override (revert to base). Pure, immutable. */
export function removeAssignment(scenario: Scenario, customerId: string): Scenario {
  return { ...scenario, assignments: scenario.assignments.filter((a) => a.customerId !== customerId) };
}

/** Clone a scenario under a new id/name. Pure. */
export function cloneScenario(scenario: Scenario, id: string, name: string): Scenario {
  return { id, name, assignments: scenario.assignments.map((a) => ({ ...a })) };
}

/** Live metrics for a scenario over a dataset (reuses scenarioMetrics). Pure. */
export function liveMetrics(dataset: TisDataset, scenario: Scenario): ScenarioMetrics {
  return scenarioMetrics(applyScenario(dataset, scenario));
}

/**
 * Build the "Current Plan" scenario from the dataset's existing route ownership —
 * the editable baseline the board opens on. Pure.
 */
export function currentPlanScenario(dataset: TisDataset, id = 'current', name = 'Current Plan'): Scenario {
  return { id, name, assignments: dataset.customers.map((c) => ({ customerId: c.id, routeId: c.ownership.routeId })) };
}
