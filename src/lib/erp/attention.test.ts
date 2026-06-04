import { describe, it, expect } from 'vitest';
import { rankAttention, summarizeAttention, coverageBand, type AttentionLike } from './attention';

const items: AttentionLike[] = [
  { title: 'Companies', count: 5, href: '/a', severity: 'info' },
  { title: 'Overdue invoices', count: 3, href: '/b', severity: 'danger' },
  { title: 'Skipped customers', count: 8, href: '/c', severity: 'warning' },
  { title: 'GPS flags', count: 2, href: '/d', severity: 'danger' },
];

describe('attention · rankAttention (exceptions-first)', () => {
  it('orders danger → warning → info, then by count desc', () => {
    const r = rankAttention(items);
    expect(r.map((i) => i.title)).toEqual([
      'Overdue invoices', // danger, 3
      'GPS flags',        // danger, 2
      'Skipped customers',// warning, 8
      'Companies',        // info, 5
    ]);
  });
  it('does not mutate the input', () => {
    const copy = [...items];
    rankAttention(items);
    expect(items).toEqual(copy);
  });
});

describe('attention · summarizeAttention', () => {
  it('tallies by severity and totals', () => {
    const s = summarizeAttention(items);
    expect(s.danger).toBe(5); // 3 + 2
    expect(s.warning).toBe(8);
    expect(s.info).toBe(5);
    expect(s.total).toBe(18);
    expect(s.itemCount).toBe(4);
    expect(s.topSeverity).toBe('danger');
  });
  it('empty → perfect health, no top severity', () => {
    const s = summarizeAttention([]);
    expect(s.healthScore).toBe(100);
    expect(s.healthBand).toBe('good');
    expect(s.topSeverity).toBe('none');
    expect(s.total).toBe(0);
  });
  it('health score degrades with severity and is clamped to [0,100]', () => {
    expect(summarizeAttention([{ title: 'x', count: 1, href: '/', severity: 'info' }]).healthScore).toBe(99);
    expect(summarizeAttention([{ title: 'x', count: 1, href: '/', severity: 'warning' }]).healthScore).toBe(95);
    expect(summarizeAttention([{ title: 'x', count: 1, href: '/', severity: 'danger' }]).healthScore).toBe(85);
    expect(summarizeAttention([{ title: 'x', count: 99, href: '/', severity: 'danger' }]).healthScore).toBe(0);
  });
  it('bands: good ≥80, attention ≥50, else critical', () => {
    expect(summarizeAttention([{ title: 'x', count: 2, href: '/', severity: 'danger' }]).healthBand).toBe('attention'); // 100-30=70
    expect(summarizeAttention([{ title: 'x', count: 1, href: '/', severity: 'info' }]).healthBand).toBe('good');        // 99
    expect(summarizeAttention([{ title: 'x', count: 5, href: '/', severity: 'danger' }]).healthBand).toBe('critical'); // 100-75=25
  });
});

describe('attention · coverageBand', () => {
  it('bands coverage %', () => {
    expect(coverageBand(95)).toBe('good');
    expect(coverageBand(60)).toBe('attention');
    expect(coverageBand(30)).toBe('critical');
    expect(coverageBand(null)).toBe('unknown');
  });
});
