import { describe, it, expect } from 'vitest';
import { computeMissionKpis, bucketMissions, mergeKpis, type MissionLite } from './route-planner-kpi';

const M = (status: MissionLite['status'], missionDate: string | null, stopCount = 0): MissionLite => ({ status, missionDate, stopCount, assignedTo: null, createdBy: 'u' });
const TODAY = '2026-06-20';

describe('computeMissionKpis', () => {
  const missions: MissionLite[] = [
    M('draft', null, 5),
    M('assigned', '2026-06-20', 8),
    M('assigned', '2026-06-18', 6),       // overdue
    M('in_progress', '2026-06-20', 10),
    M('completed', '2026-06-19', 7),      // pending report
    M('reviewed', '2026-06-15', 4),
    M('archived', '2026-06-01', 3),
  ];
  const k = computeMissionKpis(missions, TODAY);

  it('counts by status', () => {
    expect(k).toMatchObject({ total: 7, draft: 1, assigned: 2, inProgress: 1, completed: 1, reviewed: 1, archived: 1 });
  });
  it('flags overdue (dated past + still open) and today', () => {
    expect(k.overdue).toBe(1);   // the 06-18 assigned
    expect(k.today).toBe(2);     // two dated 06-20
  });
  it('sums planned visits over live missions only (excludes draft + archived)', () => {
    expect(k.plannedVisits).toBe(8 + 6 + 10 + 7 + 4); // 35
  });
  it('counts pending reports (completed awaiting review) + active', () => {
    expect(k.pendingReports).toBe(1);
    expect(k.active).toBe(3); // 2 assigned + 1 in_progress
  });
});

describe('bucketMissions', () => {
  it('splits Today / Upcoming / Overdue / Done', () => {
    const b = bucketMissions([
      M('assigned', '2026-06-20'), M('assigned', '2026-06-25'), M('in_progress', '2026-06-18'),
      M('assigned', null), M('completed', '2026-06-19'), M('reviewed', '2026-06-01'),
    ], TODAY);
    expect(b.today).toHaveLength(1);
    expect(b.upcoming).toHaveLength(2);   // 06-25 + null
    expect(b.overdue).toHaveLength(1);    // 06-18 in_progress
    expect(b.done).toHaveLength(2);       // completed + reviewed
  });
});

describe('mergeKpis', () => {
  it('combines mission + visit KPIs', () => {
    const merged = mergeKpis(computeMissionKpis([], TODAY), { completedVisits: 12, missedVisits: 3, stopsWithIssues: 2, stopsWithOpportunities: 4, followUps: 1 });
    expect(merged.completedVisits).toBe(12);
    expect(merged.total).toBe(0);
  });
});
