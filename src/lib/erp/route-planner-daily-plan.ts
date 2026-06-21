// ============================================================================
// Route Planner — Journey ⇄ persistence + Daily Visit Plan derivation (pure, no I/O).
// Wave C. The JourneyPlan carries a Map (not JSON-serialisable), so we (de)serialise it
// for storage, and derive a single day's ordered visit list FROM a journey assignment set
// — the basis of "generate Daily Visit Plans from Journey Plans".
// ============================================================================

export const JOURNEY_DAYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu'] as const;
export type JourneyDayKey = (typeof JOURNEY_DAYS)[number];

export interface StoredAssignment {
  customerId: string;
  frequency: string;
  days: string[];
  weeks: number[];
  visitCount: number;
}

/** Serialise a JourneyPlan's assignments Map → a plain object for jsonb storage. */
export function serializeAssignments(assignments: Map<string, StoredAssignment> | Iterable<[string, StoredAssignment]>): Record<string, StoredAssignment> {
  const out: Record<string, StoredAssignment> = {};
  for (const [id, a] of assignments) out[id] = a;
  return out;
}

/** Rebuild the assignments Map from stored jsonb. */
export function deserializeAssignments(obj: Record<string, StoredAssignment> | null | undefined): Map<string, StoredAssignment> {
  const m = new Map<string, StoredAssignment>();
  for (const [id, a] of Object.entries(obj ?? {})) m.set(id, a);
  return m;
}

/** Serialise a frequency Map → object. */
export function serializeFrequencies(freq: Map<string, string> | Iterable<[string, string]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, f] of freq) out[id] = f;
  return out;
}

export interface DailyVisitStop<C> { customer: C; weeks: number[] }

/**
 * Derive the Daily Visit Plan for one working day from a journey's assignments: every
 * customer scheduled on `day`, paired with the cycle-weeks they're visited. Pure; the
 * caller supplies the customer lookup so this stays engine-agnostic. Order follows the
 * provided customer list (already geo/route-ordered upstream).
 */
export function dailyVisitPlanFromJourney<C extends { id: string }>(
  assignments: Record<string, StoredAssignment> | Map<string, StoredAssignment>,
  customers: readonly C[],
  day: JourneyDayKey,
): DailyVisitStop<C>[] {
  const map = assignments instanceof Map ? assignments : deserializeAssignments(assignments);
  const out: DailyVisitStop<C>[] = [];
  for (const c of customers) {
    const a = map.get(c.id);
    if (a && a.days.includes(day)) out.push({ customer: c, weeks: a.weeks });
  }
  return out;
}

/** Count customers scheduled per day (for a quick day-load summary). */
export function dayCounts(assignments: Record<string, StoredAssignment> | Map<string, StoredAssignment>): Record<JourneyDayKey, number> {
  const map = assignments instanceof Map ? assignments : deserializeAssignments(assignments);
  const counts = Object.fromEntries(JOURNEY_DAYS.map((d) => [d, 0])) as Record<JourneyDayKey, number>;
  for (const a of map.values()) for (const d of a.days) if (d in counts) counts[d as JourneyDayKey]++;
  return counts;
}
