/**
 * Outlier detection and outstation grouping.
 * Identifies customers that are far from the main cluster and
 * groups them into outstation routes using single-linkage clustering.
 */

import { haversine } from './haversine';

export interface OutlierResult {
  /** Indices of customers within the normal range */
  normalIndices: number[];
  /** Indices of customers beyond the threshold */
  outlierIndices: number[];
}

export interface OutstationGroup {
  /** Customer indices in this outstation group */
  indices: number[];
  /** Geographic centroid of the group */
  centroid: { lat: number; lng: number };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compute robust centroid using coordinate-wise trimmed mean.
 * Trims the top and bottom 10% of lat and lng independently
 * to resist skew from extreme outliers.
 */
function robustCentroid(
  customers: ReadonlyArray<{ index: number; lat: number; lng: number }>,
): { lat: number; lng: number } {
  const n = customers.length;
  if (n === 0) return { lat: 0, lng: 0 };
  if (n <= 4) {
    // Too few for trimming — use simple mean
    let sLat = 0;
    let sLng = 0;
    for (const c of customers) {
      sLat += c.lat;
      sLng += c.lng;
    }
    return { lat: sLat / n, lng: sLng / n };
  }

  const trimFraction = 0.1;
  const trimCount = Math.floor(n * trimFraction);

  // Trimmed mean for latitude
  const lats = customers.map((c) => c.lat).sort((a, b) => a - b);
  let sumLat = 0;
  for (let i = trimCount; i < n - trimCount; i++) {
    sumLat += lats[i];
  }
  const trimmedLat = sumLat / (n - 2 * trimCount);

  // Trimmed mean for longitude
  const lngs = customers.map((c) => c.lng).sort((a, b) => a - b);
  let sumLng = 0;
  for (let i = trimCount; i < n - trimCount; i++) {
    sumLng += lngs[i];
  }
  const trimmedLng = sumLng / (n - 2 * trimCount);

  return { lat: trimmedLat, lng: trimmedLng };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect outlier customers based on distance from the robust centroid.
 *
 * @param customers  Array of customers with index, lat, lng
 * @param thresholdKm  Distance threshold in km. Customers beyond this
 *                     distance from the robust centroid are outliers.
 *                     If 0, all customers are returned as normal.
 * @returns OutlierResult with normal and outlier index arrays
 */
export function detectOutliers(
  customers: ReadonlyArray<{ index: number; lat: number; lng: number }>,
  thresholdKm: number,
): OutlierResult {
  if (thresholdKm === 0) {
    return {
      normalIndices: customers.map((c) => c.index),
      outlierIndices: [],
    };
  }

  const centroid = robustCentroid(customers);
  const normalIndices: number[] = [];
  const outlierIndices: number[] = [];

  for (const c of customers) {
    const d = haversine(c.lat, c.lng, centroid.lat, centroid.lng);
    if (d > thresholdKm) {
      outlierIndices.push(c.index);
    } else {
      normalIndices.push(c.index);
    }
  }

  return { normalIndices, outlierIndices };
}

/**
 * Group outlier customers into outstation routes using single-linkage
 * (nearest-neighbor) agglomerative clustering.
 *
 * Two clusters are merged if the minimum distance between any pair
 * of points (one from each cluster) is within linkDistanceKm.
 *
 * @param outlierCustomers  Outlier customers to group
 * @param linkDistanceKm    Maximum link distance for merging clusters
 * @returns Array of outstation groups, each with indices and centroid
 */
export function groupOutstations(
  outlierCustomers: ReadonlyArray<{ index: number; lat: number; lng: number }>,
  linkDistanceKm: number,
): OutstationGroup[] {
  const n = outlierCustomers.length;
  if (n === 0) return [];

  // Union-Find for efficient single-linkage clustering
  const parent = new Int32Array(n);
  const rank = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]]; // path compression
      x = parent[x];
    }
    return x;
  }

  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    if (rank[ra] < rank[rb]) {
      parent[ra] = rb;
    } else if (rank[ra] > rank[rb]) {
      parent[rb] = ra;
    } else {
      parent[rb] = ra;
      rank[ra]++;
    }
  }

  // Compute pairwise distances and merge if within link distance
  for (let i = 0; i < n; i++) {
    const ci = outlierCustomers[i];
    for (let j = i + 1; j < n; j++) {
      const cj = outlierCustomers[j];
      const d = haversine(ci.lat, ci.lng, cj.lat, cj.lng);
      if (d <= linkDistanceKm) {
        union(i, j);
      }
    }
  }

  // Collect clusters
  const clusterMap = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const arr = clusterMap.get(root);
    if (arr) {
      arr.push(i);
    } else {
      clusterMap.set(root, [i]);
    }
  }

  // Build output
  const groups: OutstationGroup[] = [];
  for (const members of clusterMap.values()) {
    const indices = members.map((m) => outlierCustomers[m].index);

    let sLat = 0;
    let sLng = 0;
    for (const m of members) {
      sLat += outlierCustomers[m].lat;
      sLng += outlierCustomers[m].lng;
    }

    groups.push({
      indices,
      centroid: { lat: sLat / members.length, lng: sLng / members.length },
    });
  }

  return groups;
}
