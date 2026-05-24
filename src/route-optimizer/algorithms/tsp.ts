/**
 * TSP solver using Nearest-Neighbor heuristic + 2-opt local improvement.
 * Handles both open-path and round-trip (depot-based) variants.
 */

import { haversine, buildDistanceMatrix } from './haversine';

export interface TspPoint {
  index: number;
  lat: number;
  lng: number;
}

export interface TspResult {
  /** Customer indices in optimized visit order */
  orderedIndices: number[];
  /** Total path distance in km */
  totalDistance: number;
}

// ---------------------------------------------------------------------------
// Nearest-Neighbor construction heuristic
// ---------------------------------------------------------------------------

/**
 * Build an initial tour using nearest-neighbor from the given start node.
 * @returns ordered positions (0-based into the points array)
 */
function nearestNeighborOrder(distMatrix: Float64Array, n: number, start: number): number[] {
  const visited = new Uint8Array(n);
  const order: number[] = [start];
  visited[start] = 1;

  let current = start;
  for (let step = 1; step < n; step++) {
    let bestNext = -1;
    let bestDist = Infinity;

    for (let j = 0; j < n; j++) {
      if (visited[j]) continue;
      const d = distMatrix[current * n + j];
      if (d < bestDist) {
        bestDist = d;
        bestNext = j;
      }
    }

    if (bestNext < 0) break;
    order.push(bestNext);
    visited[bestNext] = 1;
    current = bestNext;
  }

  return order;
}

// ---------------------------------------------------------------------------
// 2-opt improvement
// ---------------------------------------------------------------------------

/**
 * Compute path cost for an open path given ordered positions.
 */
function openPathCost(order: number[], distMatrix: Float64Array, n: number): number {
  let cost = 0;
  for (let i = 0; i < order.length - 1; i++) {
    cost += distMatrix[order[i] * n + order[i + 1]];
  }
  return cost;
}

/**
 * 2-opt improvement for an open path (no return to start).
 * Reverses segments to reduce total distance.
 */
function twoOptOpen(order: number[], distMatrix: Float64Array, n: number): void {
  const len = order.length;
  if (len < 3) return;

  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < len - 2; i++) {
      for (let j = i + 2; j < len; j++) {
        // Calculate improvement from reversing segment [i+1 .. j]
        const a = order[i];
        const b = order[i + 1];
        const c = order[j];
        const d = j + 1 < len ? order[j + 1] : -1;

        const oldCost =
          distMatrix[a * n + b] + (d >= 0 ? distMatrix[c * n + d] : 0);
        const newCost =
          distMatrix[a * n + c] + (d >= 0 ? distMatrix[b * n + d] : 0);

        if (newCost < oldCost - 1e-10) {
          // Reverse the segment [i+1 .. j]
          let left = i + 1;
          let right = j;
          while (left < right) {
            const tmp = order[left];
            order[left] = order[right];
            order[right] = tmp;
            left++;
            right--;
          }
          improved = true;
        }
      }
    }
  }
}

/**
 * 2-opt improvement for a round trip with a fixed depot.
 * The depot is at positions 0 and len-1 (virtual copy).
 * Only interior edges are candidates for reversal.
 */
function twoOptRoundTrip(
  order: number[],
  distMatrix: Float64Array,
  n: number,
  depotPos: number,
): void {
  const len = order.length;
  if (len < 4) return; // depot + at least 2 customers + depot

  let improved = true;
  while (improved) {
    improved = false;
    // order[0] = depot, order[len-1] = depot (virtual). Customers are [1 .. len-2].
    for (let i = 0; i < len - 2; i++) {
      for (let j = i + 2; j < len; j++) {
        // Skip if reversing would move the depot endpoints
        if (i === 0 && j === len - 1) continue;

        const a = order[i];
        const b = order[i + 1];
        const c = order[j];
        const d = j + 1 < len ? order[j + 1] : depotPos;

        const dA = a === -1 ? depotPos : a;
        const dB = b === -1 ? depotPos : b;
        const dC = c === -1 ? depotPos : c;
        const dD = d === -1 ? depotPos : d;

        const oldCost = distMatrix[dA * n + dB] + distMatrix[dC * n + dD];
        const newCost = distMatrix[dA * n + dC] + distMatrix[dB * n + dD];

        if (newCost < oldCost - 1e-10) {
          let left = i + 1;
          let right = j;
          while (left < right) {
            const tmp = order[left];
            order[left] = order[right];
            order[right] = tmp;
            left++;
            right--;
          }
          improved = true;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Solve an open-path TSP (no return to start).
 * Uses nearest-neighbor + 2-opt. Tries multiple starting points for
 * small sets, picks the best.
 */
export function solveOpenTsp(points: ReadonlyArray<TspPoint>): TspResult {
  const n = points.length;

  if (n === 0) return { orderedIndices: [], totalDistance: 0 };
  if (n === 1) return { orderedIndices: [points[0].index], totalDistance: 0 };

  const distMatrix = buildDistanceMatrix(points);

  // Try multiple starting points (up to 10 or n, whichever is smaller)
  const starts = Math.min(n, 10);
  let bestOrder: number[] = [];
  let bestCost = Infinity;

  for (let s = 0; s < starts; s++) {
    const startIdx = s < n ? s : Math.floor(Math.random() * n);
    const order = nearestNeighborOrder(distMatrix, n, startIdx);
    twoOptOpen(order, distMatrix, n);
    const cost = openPathCost(order, distMatrix, n);

    if (cost < bestCost) {
      bestCost = cost;
      bestOrder = order;
    }
  }

  return {
    orderedIndices: bestOrder.map((pos) => points[pos].index),
    totalDistance: bestCost,
  };
}

/**
 * Solve a round-trip TSP: depot -> ordered customers -> depot.
 * The depot is fixed at the start and end.
 * Uses nearest-neighbor from depot + 2-opt with fixed endpoints.
 */
export function solveRoundTripTsp(
  depot: { lat: number; lng: number },
  points: ReadonlyArray<TspPoint>,
): TspResult {
  const n = points.length;

  if (n === 0) return { orderedIndices: [], totalDistance: 0 };
  if (n === 1) {
    const d = haversine(depot.lat, depot.lng, points[0].lat, points[0].lng);
    return { orderedIndices: [points[0].index], totalDistance: d * 2 };
  }

  // Build extended point set: depot at position 0, customers at 1..n
  const allPoints: { lat: number; lng: number }[] = [depot];
  for (const p of points) {
    allPoints.push({ lat: p.lat, lng: p.lng });
  }

  const totalN = allPoints.length;
  const distMatrix = buildDistanceMatrix(allPoints);

  // Nearest-neighbor from depot (position 0)
  const order = nearestNeighborOrder(distMatrix, totalN, 0);

  // Append return to depot for 2-opt
  // order already starts with 0 (depot). We treat it as a cycle for 2-opt.
  // Add depot at end for round-trip cost calculation.
  order.push(0);

  twoOptRoundTrip(order, distMatrix, totalN, 0);

  // Calculate final cost
  let totalDistance = 0;
  for (let i = 0; i < order.length - 1; i++) {
    totalDistance += distMatrix[order[i] * totalN + order[i + 1]];
  }

  // Extract customer indices (skip depot at start and end)
  const orderedIndices = order
    .slice(1, -1)
    .map((pos) => points[pos - 1].index);

  return { orderedIndices, totalDistance };
}
