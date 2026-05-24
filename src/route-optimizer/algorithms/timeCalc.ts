/**
 * Time and KPI calculations for route plans.
 * Computes daily plans, route statistics, and overall optimizer KPIs.
 */

import { haversine, roundTripDistance } from './haversine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DayPlan {
  dayIndex: number;
  /** Customer indices assigned to this day */
  customerIndices: number[];
  /** Customer indices in optimized visit sequence */
  sequencedIndices: number[];
  /** Total travel distance in km */
  distanceKm: number;
  /** Total travel time in hours */
  travelTimeHours: number;
  /** Total visit/selling time in hours */
  visitTimeHours: number;
  /** Total working hours (travel + visits) */
  totalHours: number;
}

export interface RouteStats {
  routeIndex: number;
  totalCustomers: number;
  weeklyKm: number;
  monthlyKm: number;
  avgDailyHours: number;
  /** Selling time as a fraction of total working hours */
  sellingTimeRatio: number;
  dailyPlans: DayPlan[];
  warnings: string[];
}

export interface RouteStatsParams {
  routeIndex: number;
  /** All customers in this route with their geographic data */
  customers: ReadonlyArray<{ index: number; lat: number; lng: number }>;
  /** Map: customerIndex -> array of day indices they should be visited */
  dayAssignments: ReadonlyMap<number, number[]>;
  /** Map: dayIndex -> sequenced customer indices for that day */
  daySequences: ReadonlyMap<number, number[]>;
  /** Depot / starting location */
  depot: { lat: number; lng: number };
  /** Average travel speed in km/h */
  avgSpeed: number;
  /** Average visit duration in hours */
  avgVisitTime: number;
  /** Max daily distance in km (0 = no cap) */
  dailyKmCap: number;
  /** Max working hours per day */
  workingHoursPerDay: number;
  /** Number of working days per week */
  workingDays: number;
}

export interface KPISummary {
  totalRoutes: number;
  distributedCustomers: number;
  monthlyVisits: number;
  monthlyDistanceKm: number;
  /** Load balance: 1 - (max - min) / max of daily hours across routes */
  loadBalancePercent: number;
  /** Average selling time ratio across all routes */
  avgSellingTimePercent: number;
  unassignedCount: number;
  overloadedRoutesCount: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build a lookup map from customer index to geographic coords. */
function buildCoordsMap(
  customers: ReadonlyArray<{ index: number; lat: number; lng: number }>,
): Map<number, { lat: number; lng: number }> {
  const map = new Map<number, { lat: number; lng: number }>();
  for (const c of customers) {
    map.set(c.index, { lat: c.lat, lng: c.lng });
  }
  return map;
}

/**
 * Compute the round-trip distance for a sequenced day:
 * depot -> sequenced customers -> depot
 */
function computeDayDistance(
  depot: { lat: number; lng: number },
  sequence: number[],
  coordsMap: Map<number, { lat: number; lng: number }>,
): number {
  if (sequence.length === 0) return 0;

  const points: { lat: number; lng: number }[] = [];
  for (const idx of sequence) {
    const coord = coordsMap.get(idx);
    if (coord) points.push(coord);
  }

  return roundTripDistance(depot, points);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate comprehensive statistics for a single route.
 */
export function calculateRouteStats(params: RouteStatsParams): RouteStats {
  const {
    routeIndex,
    customers,
    dayAssignments,
    daySequences,
    depot,
    avgSpeed,
    avgVisitTime,
    dailyKmCap,
    workingHoursPerDay,
    workingDays,
  } = params;

  const coordsMap = buildCoordsMap(customers);
  const warnings: string[] = [];
  const dailyPlans: DayPlan[] = [];

  let totalWeeklyKm = 0;
  let totalVisitHours = 0;
  let totalTravelHours = 0;

  for (let day = 0; day < workingDays; day++) {
    // Collect customers assigned to this day
    const customerIndices: number[] = [];
    for (const c of customers) {
      const days = dayAssignments.get(c.index);
      if (days && days.includes(day)) {
        customerIndices.push(c.index);
      }
    }

    // Get optimized sequence for this day (fall back to assignment order)
    const sequencedIndices = daySequences.get(day) ?? customerIndices;

    // Compute distance
    const distanceKm = computeDayDistance(depot, sequencedIndices, coordsMap);

    // Compute times
    const travelTimeHours = avgSpeed > 0 ? distanceKm / avgSpeed : 0;
    const visitTimeHours = sequencedIndices.length * avgVisitTime;
    const totalHours = travelTimeHours + visitTimeHours;

    // Generate warnings
    if (dailyKmCap > 0 && distanceKm > dailyKmCap) {
      warnings.push(
        `Day ${day + 1}: distance ${distanceKm.toFixed(1)} km exceeds cap of ${dailyKmCap} km`,
      );
    }
    if (totalHours > workingHoursPerDay) {
      warnings.push(
        `Day ${day + 1}: ${totalHours.toFixed(1)}h exceeds ${workingHoursPerDay}h working limit`,
      );
    }

    dailyPlans.push({
      dayIndex: day,
      customerIndices,
      sequencedIndices,
      distanceKm,
      travelTimeHours,
      visitTimeHours,
      totalHours,
    });

    totalWeeklyKm += distanceKm;
    totalVisitHours += visitTimeHours;
    totalTravelHours += travelTimeHours;
  }

  const activeDays = dailyPlans.filter((p) => p.totalHours > 0);
  const avgDailyHours = activeDays.length > 0
    ? (totalVisitHours + totalTravelHours) / activeDays.length
    : 0;

  const totalWorkHours = totalVisitHours + totalTravelHours;
  const sellingTimeRatio = totalWorkHours > 0 ? totalVisitHours / totalWorkHours : 0;

  return {
    routeIndex,
    totalCustomers: customers.length,
    weeklyKm: totalWeeklyKm,
    monthlyKm: totalWeeklyKm * 4,
    avgDailyHours,
    sellingTimeRatio,
    dailyPlans,
    warnings,
  };
}

/**
 * Calculate aggregate KPIs across all routes.
 */
export function calculateKPIs(
  routeStats: ReadonlyArray<RouteStats>,
  unassignedCount: number = 0,
): KPISummary {
  if (routeStats.length === 0) {
    return {
      totalRoutes: 0,
      distributedCustomers: 0,
      monthlyVisits: 0,
      monthlyDistanceKm: 0,
      loadBalancePercent: 100,
      avgSellingTimePercent: 0,
      unassignedCount,
      overloadedRoutesCount: 0,
    };
  }

  let distributedCustomers = 0;
  let monthlyVisits = 0;
  let monthlyDistanceKm = 0;
  let totalSellingRatio = 0;
  let overloadedRoutesCount = 0;

  const avgDailyHoursList: number[] = [];

  for (const rs of routeStats) {
    distributedCustomers += rs.totalCustomers;
    monthlyDistanceKm += rs.monthlyKm;

    // Count monthly visits from daily plans
    let weeklyVisits = 0;
    for (const plan of rs.dailyPlans) {
      weeklyVisits += plan.sequencedIndices.length;
    }
    monthlyVisits += weeklyVisits * 4;

    totalSellingRatio += rs.sellingTimeRatio;

    if (rs.avgDailyHours > 0) {
      avgDailyHoursList.push(rs.avgDailyHours);
    }

    if (rs.warnings.length > 0) {
      overloadedRoutesCount++;
    }
  }

  // Load balance: 1 - (max - min) / max of average daily hours
  let loadBalancePercent = 100;
  if (avgDailyHoursList.length >= 2) {
    const maxH = Math.max(...avgDailyHoursList);
    const minH = Math.min(...avgDailyHoursList);
    if (maxH > 0) {
      loadBalancePercent = (1 - (maxH - minH) / maxH) * 100;
    }
  }

  const avgSellingTimePercent =
    routeStats.length > 0 ? (totalSellingRatio / routeStats.length) * 100 : 0;

  return {
    totalRoutes: routeStats.length,
    distributedCustomers,
    monthlyVisits,
    monthlyDistanceKm,
    loadBalancePercent,
    avgSellingTimePercent,
    unassignedCount,
    overloadedRoutesCount,
  };
}
