import { describe, it, expect } from 'vitest';
import { sortTimeline, groupByDay, type TimelineEvent } from './timeline';

const ev: TimelineEvent[] = [
  { date: '2026-06-01T09:00:00Z', kind: 'invoice', title: 'INV-1' },
  { date: '2026-06-03T10:00:00Z', kind: 'payment', title: 'PAY-1', amount: 50 },
  { date: '2026-06-01T12:00:00Z', kind: 'visit', title: 'Visit' },
];

describe('timeline', () => {
  it('sorts newest-first', () => {
    expect(sortTimeline(ev).map((e) => e.title)).toEqual(['PAY-1', 'Visit', 'INV-1']);
  });
  it('groups by day, newest day first', () => {
    const g = groupByDay(ev);
    expect(g.map((x) => x.day)).toEqual(['2026-06-03', '2026-06-01']);
    expect(g[1].events.map((e) => e.title)).toEqual(['Visit', 'INV-1']);
  });
  it('does not mutate input', () => {
    const copy = [...ev];
    sortTimeline(ev);
    expect(ev).toEqual(copy);
  });
});
