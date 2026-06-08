// ============================================================================
// Route Riding — analytics + dashboard read-models (Phase 3 FMCG). Pure rollups
// over RideSummary[] producing the salesman / supervisor / area / regional
// dashboard payloads + the analytics surface (trend, weakness heatmap, training
// recommendation, score evolution). No I/O — a thin server action/page wraps these.
// ============================================================================

import type { RideSummary } from './types';

const avg = (ns: number[]): number => (ns.length ? Math.round(ns.reduce((s, n) => s + n, 0) / ns.length) : 0);
const COMPLETED: RideSummary['status'][] = ['completed', 'pending_acknowledgement', 'acknowledged', 'closed'];

/** Aggregate every category's mean score across rides, weakest first. Pure. */
export function weaknessHeatmap(rides: readonly RideSummary[]): { category: string; avgScore: number; count: number }[] {
  const acc = new Map<string, number[]>();
  for (const r of rides) for (const c of r.categories) (acc.get(c.category) ?? acc.set(c.category, []).get(c.category)!).push(c.score);
  return [...acc.entries()]
    .map(([category, scores]) => ({ category, avgScore: avg(scores), count: scores.length }))
    .sort((a, b) => a.avgScore - b.avgScore);
}

/** Chronological score series for one salesman. Pure. */
export function scoreEvolution(rides: readonly RideSummary[], salesmanId: string): { date: string; score: number }[] {
  return rides
    .filter((r) => r.salesmanId === salesmanId)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({ date: r.date, score: r.overall }));
}

/** Trend over an ordered score series (first vs last third). Pure. */
export function improvementTrend(series: readonly { date: string; score: number }[]): 'improving' | 'declining' | 'stable' {
  if (series.length < 2) return 'stable';
  const n = Math.max(1, Math.floor(series.length / 3));
  const first = avg(series.slice(0, n).map((s) => s.score));
  const last = avg(series.slice(-n).map((s) => s.score));
  if (last - first >= 5) return 'improving';
  if (first - last >= 5) return 'declining';
  return 'stable';
}

/** Weakest categories for a salesman → training recommendations. Pure. */
export function trainingRecommendation(rides: readonly RideSummary[], salesmanId: string, take = 3): string[] {
  return weaknessHeatmap(rides.filter((r) => r.salesmanId === salesmanId)).slice(0, take).map((h) => h.category);
}

/** Salesman dashboard payload. Pure. */
export function salesmanDashboard(rides: readonly RideSummary[], salesmanId: string) {
  const mine = rides.filter((r) => r.salesmanId === salesmanId);
  const heat = weaknessHeatmap(mine);
  const evo = scoreEvolution(mine, salesmanId);
  return {
    rideCount: mine.length,
    averageScore: avg(mine.map((r) => r.overall)),
    improvementTrend: improvementTrend(evo),
    strengthAreas: [...heat].reverse().slice(0, 3).map((h) => h.category),
    weakAreas: heat.slice(0, 3).map((h) => h.category),
  };
}

/** Supervisor dashboard payload (their coaching activity + team performance). Pure. */
export function supervisorDashboard(rides: readonly RideSummary[], supervisorId: string) {
  const mine = rides.filter((r) => r.supervisorId === supervisorId);
  const bySalesman = new Map<string, number[]>();
  for (const r of mine) (bySalesman.get(r.salesmanId) ?? bySalesman.set(r.salesmanId, []).get(r.salesmanId)!).push(r.overall);
  return {
    coachingActivities: mine.length,
    completedRides: mine.filter((r) => COMPLETED.includes(r.status)).length,
    teamAverageScore: avg(mine.map((r) => r.overall)),
    teamMembers: [...bySalesman.entries()].map(([salesmanId, s]) => ({ salesmanId, rides: s.length, averageScore: avg(s) }))
      .sort((a, b) => a.averageScore - b.averageScore),
  };
}

/** Area-manager dashboard payload (supervisor effectiveness + development). Pure. */
export function areaManagerDashboard(rides: readonly RideSummary[]) {
  const bySup = new Map<string, RideSummary[]>();
  for (const r of rides) (bySup.get(r.supervisorId) ?? bySup.set(r.supervisorId, []).get(r.supervisorId)!).push(r);
  return {
    rideRidingCoverage: bySup.size,
    supervisorEffectiveness: [...bySup.entries()].map(([supervisorId, rs]) => ({
      supervisorId,
      rides: rs.length,
      teamAverageScore: avg(rs.map((r) => r.overall)),
    })).sort((a, b) => b.teamAverageScore - a.teamAverageScore),
    teamDevelopmentTrend: improvementTrend(rides.slice().sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({ date: r.date, score: r.overall }))),
  };
}

/** Regional dashboard payload (completion, top/bottom, training needs). Pure. */
export function regionalDashboard(rides: readonly RideSummary[], plannedCount?: number) {
  const completed = rides.filter((r) => COMPLETED.includes(r.status)).length;
  const bySup = new Map<string, number[]>();
  for (const r of rides) (bySup.get(r.supervisorId) ?? bySup.set(r.supervisorId, []).get(r.supervisorId)!).push(r.overall);
  const supers = [...bySup.entries()].map(([supervisorId, s]) => ({ supervisorId, averageScore: avg(s), rides: s.length }));
  return {
    completionPct: plannedCount && plannedCount > 0 ? Math.round((completed / plannedCount) * 100) : null,
    topSupervisors: [...supers].sort((a, b) => b.averageScore - a.averageScore).slice(0, 5),
    lowestScores: rides.slice().sort((a, b) => a.overall - b.overall).slice(0, 5).map((r) => ({ rideId: r.rideId, salesmanId: r.salesmanId, score: r.overall })),
    trainingNeeds: weaknessHeatmap(rides).slice(0, 5).map((h) => h.category),
  };
}
