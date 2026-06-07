// ============================================================================
// Distribution — coverage / journey-adherence KPI engine (Phase 3). Pure, no DB.
// Computes the core FMCG field KPIs a supervisor monitors, from a day's planned
// journey + actual visits: coverage, adherence, strike rate, off-route, missed.
// Read-model logic only — it reads the existing journey-plan + visit data; it does
// not change how visits are recorded.
// ============================================================================

export interface VisitFact {
  customerId: string;
  productive: boolean;   // a sale/order was made on the visit
  inPlan: boolean;       // visit matched today's journey plan
  outOfRoute: boolean;   // GPS/route compliance flagged it off-route
}

export interface CoverageKpis {
  planned: number;          // customers on today's plan
  visited: number;          // distinct customers visited
  plannedVisited: number;   // planned customers actually visited
  missed: number;           // planned but not visited
  offRoute: number;         // visits not in plan / flagged out-of-route
  productive: number;       // visits that produced a sale
  coveragePct: number;      // plannedVisited / planned
  adherencePct: number;     // plannedVisited / visited (how on-plan the day was)
  strikeRatePct: number;    // productive / visited
}

const pct = (num: number, den: number): number => (den <= 0 ? 0 : Math.round((num / den) * 1000) / 10);

/** Compute coverage KPIs for one rep-day. `plannedCustomerIds` = today's journey
 *  plan; `visits` = the day's actual visits (one fact per visit). Pure. */
export function coverageKpis(plannedCustomerIds: string[], visits: VisitFact[]): CoverageKpis {
  const planned = new Set(plannedCustomerIds);
  const visitedCustomers = new Set(visits.map((v) => v.customerId));

  let plannedVisited = 0;
  for (const id of visitedCustomers) if (planned.has(id)) plannedVisited++;

  const visited = visitedCustomers.size;
  const missed = Math.max(0, planned.size - plannedVisited);
  const offRoute = visits.filter((v) => v.outOfRoute || !v.inPlan).length;
  const productive = visits.filter((v) => v.productive).length;

  return {
    planned: planned.size,
    visited,
    plannedVisited,
    missed,
    offRoute,
    productive,
    coveragePct: pct(plannedVisited, planned.size),
    adherencePct: pct(plannedVisited, visited),
    strikeRatePct: pct(productive, visited),
  };
}

/** Aggregate several rep-day KPIs (e.g. a supervisor's team) into a roll-up. */
export function rollupCoverage(days: CoverageKpis[]): CoverageKpis {
  const sum = (f: (k: CoverageKpis) => number) => days.reduce((s, k) => s + f(k), 0);
  const planned = sum((k) => k.planned);
  const visited = sum((k) => k.visited);
  const plannedVisited = sum((k) => k.plannedVisited);
  const productive = sum((k) => k.productive);
  return {
    planned,
    visited,
    plannedVisited,
    missed: sum((k) => k.missed),
    offRoute: sum((k) => k.offRoute),
    productive,
    coveragePct: pct(plannedVisited, planned),
    adherencePct: pct(plannedVisited, visited),
    strikeRatePct: pct(productive, visited),
  };
}
