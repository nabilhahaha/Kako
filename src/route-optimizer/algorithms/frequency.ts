/**
 * Weekly visit frequency allocation.
 * Converts monthly visit counts to weekly frequencies and assigns
 * specific weekdays while keeping daily workloads balanced.
 */

export interface FrequencyAllocation {
  customerIndex: number;
  /** 0-based day indices the customer should be visited */
  assignedDays: number[];
}

/**
 * Convert monthly visits to weekly frequency, clamped to 1–3.
 *
 * @param monthlyVisits Number of visits per month
 * @returns Weekly frequency (1, 2, or 3)
 */
export function monthlyToWeekly(monthlyVisits: number): number {
  const weekly = monthlyVisits / 4;
  return Math.max(1, Math.min(3, Math.round(weekly)));
}

/**
 * Generate valid day patterns for a given frequency and number of working days.
 * Days are spaced as evenly as possible (non-consecutive when possible).
 */
function getSpacedDayPatterns(freq: number, workingDays: number): number[][] {
  if (freq === 1) {
    // One visit: any single day
    return Array.from({ length: workingDays }, (_, d) => [d]);
  }

  if (freq === 2) {
    // Two visits: pick pairs with maximum spacing (avoid consecutive days)
    const patterns: number[][] = [];
    for (let a = 0; a < workingDays; a++) {
      for (let b = a + 1; b < workingDays; b++) {
        // Prefer gap >= 2 (e.g., Mon+Wed, Tue+Thu), but allow gap=1 if needed
        if (b - a >= 2) {
          patterns.push([a, b]);
        }
      }
    }
    // If no non-consecutive pairs (e.g., workingDays=2), allow consecutive
    if (patterns.length === 0) {
      for (let a = 0; a < workingDays; a++) {
        for (let b = a + 1; b < workingDays; b++) {
          patterns.push([a, b]);
        }
      }
    }
    return patterns;
  }

  if (freq >= 3) {
    // Three visits: pick triples with maximum spacing
    const patterns: number[][] = [];
    for (let a = 0; a < workingDays; a++) {
      for (let b = a + 1; b < workingDays; b++) {
        for (let c = b + 1; c < workingDays; c++) {
          // Prefer evenly spaced: gaps of at least 1 between each
          if (b - a >= 1 && c - b >= 1) {
            patterns.push([a, b, c]);
          }
        }
      }
    }
    if (patterns.length === 0) {
      // Fallback: just pick any 3 distinct days
      for (let a = 0; a < workingDays; a++) {
        for (let b = a + 1; b < workingDays; b++) {
          for (let c = b + 1; c < workingDays; c++) {
            patterns.push([a, b, c]);
          }
        }
      }
    }
    return patterns;
  }

  return [[0]];
}

/**
 * Allocate visit days for each customer so that:
 * 1. Customers with freq=1 get one day
 * 2. Customers with freq=2 get two spaced (non-consecutive) days
 * 3. Customers with freq=3 get three spaced days
 * 4. Each weekday gets a similar total number of visits
 *
 * @param customers  Array of {index, weeklyFreq} objects
 * @param workingDays Number of working days per week (e.g., 5 or 6)
 * @returns Array of day allocations per customer
 */
export function allocateFrequencies(
  customers: ReadonlyArray<{ index: number; weeklyFreq: number }>,
  workingDays: number,
): FrequencyAllocation[] {
  if (workingDays <= 0 || customers.length === 0) return [];

  // Track how many visits each day has been assigned
  const dayLoads = new Int32Array(workingDays);

  const results: FrequencyAllocation[] = [];

  // Sort customers by frequency descending — higher-frequency customers
  // are harder to place, so assign them first.
  const sorted = [...customers].sort((a, b) => b.weeklyFreq - a.weeklyFreq);

  for (const customer of sorted) {
    const freq = Math.max(1, Math.min(3, customer.weeklyFreq));
    const patterns = getSpacedDayPatterns(freq, workingDays);

    if (patterns.length === 0) {
      // Fallback: assign to least loaded days
      const days: number[] = [];
      for (let f = 0; f < freq && f < workingDays; f++) {
        let minLoad = Infinity;
        let minDay = 0;
        for (let d = 0; d < workingDays; d++) {
          if (!days.includes(d) && dayLoads[d] < minLoad) {
            minLoad = dayLoads[d];
            minDay = d;
          }
        }
        days.push(minDay);
        dayLoads[minDay]++;
      }
      results.push({ customerIndex: customer.index, assignedDays: days.sort((a, b) => a - b) });
      continue;
    }

    // Pick the pattern that best balances daily loads.
    // Score = max load among the days in the pattern after adding visits.
    let bestPattern = patterns[0];
    let bestScore = Infinity;

    for (const pattern of patterns) {
      // The score is the maximum day load that would result
      let maxDayLoad = 0;
      for (const d of pattern) {
        const newLoad = dayLoads[d] + 1;
        if (newLoad > maxDayLoad) maxDayLoad = newLoad;
      }
      // Tiebreak: minimize total load across pattern days
      let totalLoad = 0;
      for (const d of pattern) {
        totalLoad += dayLoads[d];
      }
      const score = maxDayLoad * 1_000_000 + totalLoad;

      if (score < bestScore) {
        bestScore = score;
        bestPattern = pattern;
      }
    }

    for (const d of bestPattern) {
      dayLoads[d]++;
    }

    results.push({
      customerIndex: customer.index,
      assignedDays: [...bestPattern],
    });
  }

  return results;
}
