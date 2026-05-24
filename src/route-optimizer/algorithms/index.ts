/**
 * Route Optimizer Algorithm Modules
 *
 * Pure-function algorithm library for JPFOOD route optimization.
 * No React or UI dependencies — all modules are framework-agnostic.
 */

// Haversine distance calculations
export {
  haversine,
  buildDistanceMatrix,
  totalPathDistance,
  roundTripDistance,
} from './haversine';

// Capacity-constrained k-means clustering
export {
  distributeByCount,
  distributeByWorkload,
} from './kmeans';
export type { CustomerPoint, ClusterResult } from './kmeans';

// TSP solver (nearest-neighbor + 2-opt)
export {
  solveOpenTsp,
  solveRoundTripTsp,
} from './tsp';
export type { TspPoint, TspResult } from './tsp';

// Weekly visit frequency allocation
export {
  monthlyToWeekly,
  allocateFrequencies,
} from './frequency';
export type { FrequencyAllocation } from './frequency';

// Outlier detection and outstation grouping
export {
  detectOutliers,
  groupOutstations,
} from './outlier';
export type { OutlierResult, OutstationGroup } from './outlier';

// Time and KPI calculations
export {
  calculateRouteStats,
  calculateKPIs,
} from './timeCalc';
export type {
  DayPlan,
  RouteStats,
  RouteStatsParams,
  KPISummary,
} from './timeCalc';
