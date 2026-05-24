import type { Customer, OptimizationParams, OptimizationResult, RouteResult, DayPlan as AppDayPlan } from '../types';
import { distributeByCount, distributeByWorkload } from './kmeans';
import { solveRoundTripTsp } from './tsp';
import { monthlyToWeekly, allocateFrequencies } from './frequency';
import { detectOutliers, groupOutstations } from './outlier';
import { calculateRouteStats, calculateKPIs } from './timeCalc';
import { generateGoogleMapsUrl } from '../excelExport';

const ROUTE_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
  '#d946ef', '#84cc16', '#0ea5e9', '#e11d48', '#a855f7',
  '#10b981', '#f43f5e', '#0891b2', '#c026d3', '#65a30d',
  '#7c3aed', '#059669', '#dc2626', '#2563eb', '#ca8a04',
  '#9333ea', '#16a34a', '#ea580c', '#4f46e5', '#0d9488',
];

function progress(step: string, percent: number) {
  self.postMessage({ type: 'progress', step, percent });
}

function getColor(i: number): string {
  return ROUTE_COLORS[i % ROUTE_COLORS.length];
}

self.onmessage = (e: MessageEvent) => {
  const { customers, params } = e.data as { customers: Customer[]; params: OptimizationParams };

  try {
    runOptimization(customers, params);
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) });
  }
};

function runOptimization(customers: Customer[], params: OptimizationParams) {
  progress('distributing', 5);

  // 1. Determine weekly frequency for each customer
  const customersWithFreq = customers.map((c) => ({
    ...c,
    weeklyFreq: params.frequencySource === 'uniform'
      ? params.uniformFrequency
      : monthlyToWeekly(c.monthlyVisits),
  }));

  // 2. Outlier detection
  let normalCustomers = customersWithFreq;
  let outlierCustomers: Customer[] = [];

  if (params.outlierDistance > 0) {
    const points = customersWithFreq.map((c) => ({ index: c.index, lat: c.lat, lng: c.lng }));
    const { normalIndices, outlierIndices } = detectOutliers(points, params.outlierDistance);
    const custMap = new Map(customersWithFreq.map((c) => [c.index, c]));
    normalCustomers = normalIndices.map((i) => custMap.get(i)!);
    outlierCustomers = outlierIndices.map((i) => custMap.get(i)!);
  }

  progress('distributing', 15);

  // 3. Cluster normal customers into routes
  const customerPoints = normalCustomers.map((c) => ({
    index: c.index,
    lat: c.lat,
    lng: c.lng,
    monthlyVisits: c.monthlyVisits,
  }));

  let clusterResult;
  if (params.distributionMethod === 'count') {
    clusterResult = distributeByCount(customerPoints, params.numberOfRoutes, params.customersPerRoute);
  } else {
    clusterResult = distributeByWorkload(
      customerPoints,
      params.numberOfRoutes,
      params.avgVisitTime / 60,
      params.avgSpeed,
      params.workingHoursPerDay,
      params.workingDaysPerWeek,
    );
  }

  progress('distributing', 30);

  const custMap = new Map(customersWithFreq.map((c) => [c.index, c]));

  // 4. Build routes
  const routes: RouteResult[] = [];

  for (let ri = 0; ri < clusterResult.clusters.length; ri++) {
    const clusterIndices = clusterResult.clusters[ri];
    const clusterCustomers = clusterIndices.map((i) => custMap.get(i)!).filter(Boolean);

    if (clusterCustomers.length === 0) continue;

    progress('sequencing', 30 + (ri / clusterResult.clusters.length) * 30);

    // Compute centroid as default depot
    const centroid = clusterResult.centroids[ri] ?? {
      lat: clusterCustomers.reduce((s, c) => s + c.lat, 0) / clusterCustomers.length,
      lng: clusterCustomers.reduce((s, c) => s + c.lng, 0) / clusterCustomers.length,
    };

    // 5. Allocate weekday frequencies
    const freqInput = clusterCustomers.map((c) => ({ index: c.index, weeklyFreq: c.weeklyFreq }));
    const allocations = allocateFrequencies(freqInput, params.workingDaysPerWeek);

    const dayAssignments = new Map<number, number[]>();
    for (const alloc of allocations) {
      dayAssignments.set(alloc.customerIndex, alloc.assignedDays);
    }

    // Group customers by day
    const dayGroups = new Map<number, number[]>();
    for (let d = 0; d < params.workingDaysPerWeek; d++) {
      dayGroups.set(d, []);
    }
    for (const alloc of allocations) {
      for (const day of alloc.assignedDays) {
        dayGroups.get(day)?.push(alloc.customerIndex);
      }
    }

    // 6. TSP for each day
    const daySequences = new Map<number, number[]>();
    for (const [dayIdx, dayCustomerIndices] of dayGroups.entries()) {
      if (dayCustomerIndices.length === 0) {
        daySequences.set(dayIdx, []);
        continue;
      }

      const dayPoints = dayCustomerIndices.map((ci) => {
        const c = custMap.get(ci)!;
        return { index: c.index, lat: c.lat, lng: c.lng };
      });

      const tspResult = solveRoundTripTsp(centroid, dayPoints);
      daySequences.set(dayIdx, tspResult.orderedIndices);
    }

    // 7. Calculate stats
    const statsCustomers = clusterCustomers.map((c) => ({ index: c.index, lat: c.lat, lng: c.lng }));
    const stats = calculateRouteStats({
      routeIndex: ri,
      customers: statsCustomers,
      dayAssignments,
      daySequences,
      depot: centroid,
      avgSpeed: params.avgSpeed,
      avgVisitTime: params.avgVisitTime / 60,
      dailyKmCap: params.dailyKmCap,
      workingHoursPerDay: params.workingHoursPerDay,
      workingDays: params.workingDaysPerWeek,
    });

    const DAY_NAMES = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];

    const dailyPlans: AppDayPlan[] = stats.dailyPlans.map((dp) => {
      const seqCustomers = dp.sequencedIndices.map((i) => custMap.get(i)!).filter(Boolean);
      const depot = { lat: centroid.lat, lng: centroid.lng, source: 'manual' as const };
      return {
        dayIndex: dp.dayIndex,
        dayName: DAY_NAMES[dp.dayIndex] ?? `Day ${dp.dayIndex}`,
        customerIndices: dp.customerIndices,
        sequencedCustomers: seqCustomers,
        distanceKm: dp.distanceKm,
        travelTimeHours: dp.travelTimeHours,
        visitTimeHours: dp.visitTimeHours,
        totalHours: dp.totalHours,
        googleMapsUrl: generateGoogleMapsUrl(depot, seqCustomers),
      };
    });

    routes.push({
      routeIndex: ri,
      routeType: 'normal',
      customers: clusterCustomers,
      depot: { lat: centroid.lat, lng: centroid.lng, source: 'manual' },
      totalCustomers: clusterCustomers.length,
      weeklyKm: stats.weeklyKm,
      monthlyKm: stats.monthlyKm,
      avgDailyHours: stats.avgDailyHours,
      sellingTimeRatio: stats.sellingTimeRatio,
      dailyPlans,
      warnings: stats.warnings,
      color: getColor(ri),
    });
  }

  progress('allocating', 70);

  // 8. Outstation routes
  const outstationRoutes: RouteResult[] = [];
  let needsDecision: Customer[] = [];

  if (params.createOutstationRoutes && outlierCustomers.length > 0) {
    const outlierPoints = outlierCustomers.map((c) => ({ index: c.index, lat: c.lat, lng: c.lng }));
    const groups = groupOutstations(outlierPoints, params.outlierLinkDistance);

    groups.forEach((group, gi) => {
      const groupCustomers = group.indices.map((i) => custMap.get(i)!).filter(Boolean);
      if (groupCustomers.length === 0) return;

      const depot = group.centroid;
      const freqInput = groupCustomers.map((c) => ({ index: c.index, weeklyFreq: c.weeklyFreq }));
      const allocations = allocateFrequencies(freqInput, params.workingDaysPerWeek);

      const dayAssignments = new Map<number, number[]>();
      for (const alloc of allocations) {
        dayAssignments.set(alloc.customerIndex, alloc.assignedDays);
      }

      const dayGroups = new Map<number, number[]>();
      for (let d = 0; d < params.workingDaysPerWeek; d++) dayGroups.set(d, []);
      for (const alloc of allocations) {
        for (const day of alloc.assignedDays) dayGroups.get(day)?.push(alloc.customerIndex);
      }

      const daySequences = new Map<number, number[]>();
      for (const [dayIdx, dayCI] of dayGroups.entries()) {
        if (dayCI.length === 0) { daySequences.set(dayIdx, []); continue; }
        const pts = dayCI.map((ci) => { const c = custMap.get(ci)!; return { index: c.index, lat: c.lat, lng: c.lng }; });
        const r = solveRoundTripTsp(depot, pts);
        daySequences.set(dayIdx, r.orderedIndices);
      }

      const stats = calculateRouteStats({
        routeIndex: routes.length + gi,
        customers: groupCustomers.map((c) => ({ index: c.index, lat: c.lat, lng: c.lng })),
        dayAssignments,
        daySequences,
        depot,
        avgSpeed: params.avgSpeed,
        avgVisitTime: params.avgVisitTime / 60,
        dailyKmCap: params.dailyKmCap,
        workingHoursPerDay: params.workingHoursPerDay,
        workingDays: params.workingDaysPerWeek,
      });

      const DAY_NAMES = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];
      const dailyPlans: AppDayPlan[] = stats.dailyPlans.map((dp) => {
        const seqCustomers = dp.sequencedIndices.map((i) => custMap.get(i)!).filter(Boolean);
        return {
          dayIndex: dp.dayIndex,
          dayName: DAY_NAMES[dp.dayIndex] ?? `Day ${dp.dayIndex}`,
          customerIndices: dp.customerIndices,
          sequencedCustomers: seqCustomers,
          distanceKm: dp.distanceKm,
          travelTimeHours: dp.travelTimeHours,
          visitTimeHours: dp.visitTimeHours,
          totalHours: dp.totalHours,
          googleMapsUrl: generateGoogleMapsUrl({ lat: depot.lat, lng: depot.lng, source: 'manual' }, seqCustomers),
        };
      });

      outstationRoutes.push({
        routeIndex: routes.length + gi,
        routeType: 'outstation',
        customers: groupCustomers,
        depot: { lat: depot.lat, lng: depot.lng, source: 'manual' },
        totalCustomers: groupCustomers.length,
        weeklyKm: stats.weeklyKm,
        monthlyKm: stats.monthlyKm,
        avgDailyHours: stats.avgDailyHours,
        sellingTimeRatio: stats.sellingTimeRatio,
        dailyPlans,
        warnings: stats.warnings,
        color: getColor(routes.length + gi),
      });
    });
  } else {
    needsDecision = outlierCustomers;
  }

  progress('calculating', 90);

  // 9. Unassigned customers
  const unassignedCustomers = clusterResult.unassigned.map((i) => custMap.get(i)!).filter(Boolean);

  // 10. KPIs
  const allRouteStats = [...routes, ...outstationRoutes];
  const kpiInput = allRouteStats.map((r) => ({
    routeIndex: r.routeIndex,
    totalCustomers: r.totalCustomers,
    weeklyKm: r.weeklyKm,
    monthlyKm: r.monthlyKm,
    avgDailyHours: r.avgDailyHours,
    sellingTimeRatio: r.sellingTimeRatio,
    dailyPlans: r.dailyPlans.map((dp) => ({
      dayIndex: dp.dayIndex,
      customerIndices: dp.customerIndices,
      sequencedIndices: dp.sequencedCustomers.map((c) => c.index),
      distanceKm: dp.distanceKm,
      travelTimeHours: dp.travelTimeHours,
      visitTimeHours: dp.visitTimeHours,
      totalHours: dp.totalHours,
    })),
    warnings: r.warnings,
  }));

  const kpis = calculateKPIs(kpiInput);

  const result: OptimizationResult = {
    routes,
    outstationRoutes,
    unassignedCustomers,
    needsDecision,
    kpis: {
      totalRoutes: kpis.totalRoutes,
      distributedCustomers: kpis.distributedCustomers,
      monthlyVisits: kpis.monthlyVisits,
      monthlyDistance: kpis.monthlyDistanceKm,
      loadBalancePercent: kpis.loadBalancePercent,
      avgSellingTime: kpis.avgSellingTimePercent,
      unassignedCount: unassignedCustomers.length,
      overloadedRoutes: kpis.overloadedRoutesCount,
    },
  };

  progress('completed', 100);
  self.postMessage({ type: 'result', result });
}
