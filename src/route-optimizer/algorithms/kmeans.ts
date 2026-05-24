/**
 * Capacity-constrained k-means clustering for distributing customers into routes.
 * Produces geographically balanced clusters respecting capacity constraints.
 */

import { haversine } from './haversine';

export interface CustomerPoint {
  index: number;
  lat: number;
  lng: number;
  monthlyVisits: number;
}

export interface ClusterResult {
  /** Array of customer indices per cluster */
  clusters: number[][];
  /** Geographic centroid of each cluster */
  centroids: { lat: number; lng: number }[];
  /** Customer indices that could not be assigned within capacity */
  unassigned: number[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Pick initial centroids using k-means++ seeding for better convergence. */
function initCentroidsKMeansPP(
  customers: ReadonlyArray<CustomerPoint>,
  k: number,
): { lat: number; lng: number }[] {
  const n = customers.length;
  const centroids: { lat: number; lng: number }[] = [];

  // First centroid: random
  const firstIdx = Math.floor(Math.random() * n);
  centroids.push({ lat: customers[firstIdx].lat, lng: customers[firstIdx].lng });

  const minDist = new Float64Array(n).fill(Infinity);

  for (let c = 1; c < k; c++) {
    const prev = centroids[c - 1];
    let totalWeight = 0;

    for (let i = 0; i < n; i++) {
      const d = haversine(customers[i].lat, customers[i].lng, prev.lat, prev.lng);
      if (d < minDist[i]) minDist[i] = d;
      totalWeight += minDist[i] * minDist[i];
    }

    // Weighted random selection
    let r = Math.random() * totalWeight;
    let chosen = 0;
    for (let i = 0; i < n; i++) {
      r -= minDist[i] * minDist[i];
      if (r <= 0) {
        chosen = i;
        break;
      }
    }

    centroids.push({ lat: customers[chosen].lat, lng: customers[chosen].lng });
  }

  return centroids;
}

/** Recompute centroids from assigned members. */
function recomputeCentroids(
  customers: ReadonlyArray<CustomerPoint>,
  assignments: Int32Array,
  k: number,
): { lat: number; lng: number }[] {
  const sumLat = new Float64Array(k);
  const sumLng = new Float64Array(k);
  const count = new Int32Array(k);

  for (let i = 0; i < customers.length; i++) {
    const a = assignments[i];
    if (a < 0) continue;
    sumLat[a] += customers[i].lat;
    sumLng[a] += customers[i].lng;
    count[a]++;
  }

  const centroids: { lat: number; lng: number }[] = [];
  for (let c = 0; c < k; c++) {
    if (count[c] > 0) {
      centroids.push({ lat: sumLat[c] / count[c], lng: sumLng[c] / count[c] });
    } else {
      // Empty cluster — re-seed from a random unassigned or farthest point
      const idx = Math.floor(Math.random() * customers.length);
      centroids.push({ lat: customers[idx].lat, lng: customers[idx].lng });
    }
  }

  return centroids;
}

/**
 * Capacity-constrained k-means: assigns each customer to the nearest centroid
 * whose cluster has not yet reached capacity.
 */
function constrainedAssign(
  customers: ReadonlyArray<CustomerPoint>,
  centroids: ReadonlyArray<{ lat: number; lng: number }>,
  capacities: Int32Array,
): { assignments: Int32Array; unassigned: number[] } {
  const n = customers.length;
  const k = centroids.length;
  const assignments = new Int32Array(n).fill(-1);
  const clusterSizes = new Int32Array(k);
  const unassigned: number[] = [];

  // Build distance-to-centroid for each customer, sort by min distance descending
  // so the hardest-to-place customers get priority (antivoronoi trick).
  const distToCentroid = new Float64Array(n * k);
  const customerOrder: number[] = [];

  for (let i = 0; i < n; i++) {
    customerOrder.push(i);
    let minD = Infinity;
    for (let c = 0; c < k; c++) {
      const d = haversine(customers[i].lat, customers[i].lng, centroids[c].lat, centroids[c].lng);
      distToCentroid[i * k + c] = d;
      if (d < minD) minD = d;
    }
  }

  // Sort customers by their distance to nearest centroid (ascending — closest first
  // tends to converge better with capacity constraints).
  customerOrder.sort((a, b) => {
    let minA = Infinity;
    let minB = Infinity;
    for (let c = 0; c < k; c++) {
      if (distToCentroid[a * k + c] < minA) minA = distToCentroid[a * k + c];
      if (distToCentroid[b * k + c] < minB) minB = distToCentroid[b * k + c];
    }
    return minA - minB;
  });

  for (const i of customerOrder) {
    // Rank centroids by distance
    const ranked: number[] = [];
    for (let c = 0; c < k; c++) ranked.push(c);
    ranked.sort((a, b) => distToCentroid[i * k + a] - distToCentroid[i * k + b]);

    let placed = false;
    for (const c of ranked) {
      if (clusterSizes[c] < capacities[c]) {
        assignments[i] = c;
        clusterSizes[c]++;
        placed = true;
        break;
      }
    }

    if (!placed) {
      unassigned.push(customers[i].index);
    }
  }

  return { assignments, unassigned };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const MAX_ITERATIONS = 100;

/**
 * Distribute customers into `numRoutes` clusters, each with at most
 * `customersPerRoute` customers. Uses capacity-constrained k-means.
 *
 * - The last route absorbs remainder if total <= numRoutes * customersPerRoute.
 * - If total > numRoutes * customersPerRoute, excess goes to `unassigned`.
 */
export function distributeByCount(
  customers: ReadonlyArray<CustomerPoint>,
  numRoutes: number,
  customersPerRoute: number,
): ClusterResult {
  const n = customers.length;
  const k = Math.min(numRoutes, n);

  if (k === 0 || n === 0) {
    return { clusters: [], centroids: [], unassigned: customers.map((c) => c.index) };
  }

  // Build capacity array: each route gets customersPerRoute.
  // Last route gets remainder if total fits.
  const totalCapacity = k * customersPerRoute;
  const capacities = new Int32Array(k).fill(customersPerRoute);
  if (totalCapacity >= n) {
    // Last route absorbs remainder
    const basePerRoute = Math.floor(n / k);
    const extra = n - basePerRoute * k;
    capacities.fill(basePerRoute);
    for (let i = 0; i < extra; i++) {
      capacities[i]++;
    }
  }

  let centroids = initCentroidsKMeansPP(customers, k);
  let bestAssignments = new Int32Array(n).fill(-1);
  let bestUnassigned: number[] = [];

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const { assignments, unassigned } = constrainedAssign(customers, centroids, capacities);
    bestAssignments = assignments;
    bestUnassigned = unassigned;

    const newCentroids = recomputeCentroids(customers, assignments, k);

    // Check convergence
    let maxShift = 0;
    for (let c = 0; c < k; c++) {
      const shift = haversine(
        centroids[c].lat,
        centroids[c].lng,
        newCentroids[c].lat,
        newCentroids[c].lng,
      );
      if (shift > maxShift) maxShift = shift;
    }

    centroids = newCentroids;

    if (maxShift < 0.01) break; // converged (< 10m shift)
  }

  // Build cluster arrays
  const clusters: number[][] = Array.from({ length: k }, () => []);
  for (let i = 0; i < n; i++) {
    const a = bestAssignments[i];
    if (a >= 0) {
      clusters[a].push(customers[i].index);
    }
  }

  return { clusters, centroids, unassigned: bestUnassigned };
}

/**
 * Distribute customers into routes balanced by estimated workload.
 *
 * Starts from a count-balanced clustering, then iteratively moves boundary
 * customers from the highest-workload route to the lowest until daily working
 * hours converge (gap < 6%) or a maximum number of swaps is reached.
 *
 * @param avgVisitTime  Average visit duration in hours
 * @param avgSpeed      Average travel speed in km/h
 * @param workingHoursPerDay  Max working hours per day
 * @param workingDays   Number of working days per week
 */
export function distributeByWorkload(
  customers: ReadonlyArray<CustomerPoint>,
  numRoutes: number,
  avgVisitTime: number,
  avgSpeed: number,
  workingHoursPerDay: number,
  workingDays: number,
): ClusterResult {
  const n = customers.length;
  const k = Math.min(numRoutes, n);

  if (k === 0 || n === 0) {
    return { clusters: [], centroids: [], unassigned: customers.map((c) => c.index) };
  }

  // Start with balanced-count clustering
  const basePerRoute = Math.ceil(n / k);
  const initial = distributeByCount(customers, k, basePerRoute);

  // Mutable copy of clusters
  const clusters = initial.clusters.map((c) => [...c]);
  const centroids = [...initial.centroids];

  // Index map: customerIndex -> position in customers array
  const indexMap = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    indexMap.set(customers[i].index, i);
  }

  /** Estimate total daily hours for a route cluster. */
  const estimateHours = (clusterIndices: number[]): number => {
    if (clusterIndices.length === 0) return 0;

    // Total monthly visits
    let totalMonthlyVisits = 0;
    for (const idx of clusterIndices) {
      const pos = indexMap.get(idx);
      if (pos !== undefined) {
        totalMonthlyVisits += customers[pos].monthlyVisits;
      }
    }

    const weeklyVisits = totalMonthlyVisits / 4;
    const dailyVisits = weeklyVisits / workingDays;
    const visitHours = dailyVisits * avgVisitTime;

    // Rough travel estimate: average distance between consecutive points
    // Use centroid-based heuristic for speed
    let sumDist = 0;
    const points = clusterIndices
      .map((idx) => {
        const pos = indexMap.get(idx);
        return pos !== undefined ? customers[pos] : null;
      })
      .filter((p): p is CustomerPoint => p !== null);

    if (points.length > 1) {
      // Estimate average inter-customer distance using centroid radius heuristic
      let cLat = 0;
      let cLng = 0;
      for (const p of points) {
        cLat += p.lat;
        cLng += p.lng;
      }
      cLat /= points.length;
      cLng /= points.length;

      for (const p of points) {
        sumDist += haversine(p.lat, p.lng, cLat, cLng);
      }
      const avgRadius = sumDist / points.length;
      // Approximate daily travel as 2 * avgRadius * sqrt(dailyVisits)
      const dailyTravel = 2 * avgRadius * Math.sqrt(Math.max(dailyVisits, 1));
      const travelHours = dailyTravel / avgSpeed;
      return visitHours + travelHours;
    }

    return visitHours;
  };

  // Build cluster assignment map: customerIndex -> cluster index
  const clusterOf = new Map<number, number>();
  for (let c = 0; c < clusters.length; c++) {
    for (const idx of clusters[c]) {
      clusterOf.set(idx, c);
    }
  }

  const GAP_THRESHOLD = 0.06; // 6%
  const MAX_SWAPS = n; // at most one swap per customer

  for (let swap = 0; swap < MAX_SWAPS; swap++) {
    // Compute hours for each route
    const hours = clusters.map(estimateHours);
    const minH = Math.min(...hours.filter((h) => h > 0));
    const maxH = Math.max(...hours);

    if (maxH === 0 || (maxH - minH) / maxH < GAP_THRESHOLD) break;

    const heavyIdx = hours.indexOf(maxH);
    const lightIdx = hours.indexOf(minH);

    if (heavyIdx === lightIdx) break;

    // Find boundary customer in heavy cluster closest to light centroid
    const lightCentroid = centroids[lightIdx];
    let bestCust = -1;
    let bestDist = Infinity;

    for (const custIdx of clusters[heavyIdx]) {
      const pos = indexMap.get(custIdx);
      if (pos === undefined) continue;
      const d = haversine(
        customers[pos].lat,
        customers[pos].lng,
        lightCentroid.lat,
        lightCentroid.lng,
      );
      if (d < bestDist) {
        bestDist = d;
        bestCust = custIdx;
      }
    }

    if (bestCust < 0) break;

    // Move customer from heavy to light
    clusters[heavyIdx] = clusters[heavyIdx].filter((idx) => idx !== bestCust);
    clusters[lightIdx].push(bestCust);
    clusterOf.set(bestCust, lightIdx);

    // Recompute centroids for affected clusters
    for (const ci of [heavyIdx, lightIdx]) {
      let sLat = 0;
      let sLng = 0;
      for (const idx of clusters[ci]) {
        const pos = indexMap.get(idx);
        if (pos !== undefined) {
          sLat += customers[pos].lat;
          sLng += customers[pos].lng;
        }
      }
      const cnt = clusters[ci].length;
      if (cnt > 0) {
        centroids[ci] = { lat: sLat / cnt, lng: sLng / cnt };
      }
    }
  }

  return {
    clusters,
    centroids,
    unassigned: initial.unassigned,
  };
}
