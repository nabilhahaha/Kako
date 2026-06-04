import { describe, it, expect } from 'vitest';
import { highlightMatch, groupByType, scoreResult, rankResults, pushRecent, type SearchResultLike } from './search-helpers';

describe('search · highlightMatch', () => {
  it('marks the matched substring (case-insensitive)', () => {
    expect(highlightMatch('Al-Salam Market', 'salam')).toEqual([
      { text: 'Al-', match: false },
      { text: 'Salam', match: true },
      { text: ' Market', match: false },
    ]);
  });
  it('no match → single segment', () => {
    expect(highlightMatch('Cairo', 'xyz')).toEqual([{ text: 'Cairo', match: false }]);
  });
  it('empty query → single unmatched segment', () => {
    expect(highlightMatch('Cairo', '  ')).toEqual([{ text: 'Cairo', match: false }]);
  });
});

describe('search · groupByType', () => {
  it('groups preserving first-seen order', () => {
    const rows: SearchResultLike[] = [
      { id: '1', label: 'A', type: 'customer' },
      { id: '2', label: 'B', type: 'product' },
      { id: '3', label: 'C', type: 'customer' },
    ];
    const g = groupByType(rows);
    expect(g.map((x) => x.type)).toEqual(['customer', 'product']);
    expect(g[0].items.map((i) => i.id)).toEqual(['1', '3']);
  });
});

describe('search · ranking', () => {
  it('scores exact > prefix > word-prefix > substring > none', () => {
    expect(scoreResult('cairo', 'cairo')).toBeGreaterThan(scoreResult('cairo store', 'cairo'));
    expect(scoreResult('cairo store', 'cairo')).toBeGreaterThan(scoreResult('north cairo', 'cairo'));
    expect(scoreResult('north cairo', 'cairo')).toBeGreaterThan(scoreResult('decairo x', 'cairo'));
    expect(scoreResult('zzz', 'cairo')).toBe(0);
  });
  it('rankResults orders best-first, stable for ties', () => {
    const rows: SearchResultLike[] = [
      { id: '1', label: 'North Cairo', type: 't' },
      { id: '2', label: 'Cairo', type: 't' },
      { id: '3', label: 'Cairo Mall', type: 't' },
    ];
    expect(rankResults(rows, 'cairo').map((r) => r.id)).toEqual(['2', '3', '1']);
  });
});

describe('search · pushRecent', () => {
  it('dedups, most-recent-first, capped', () => {
    let l = pushRecent([], 'a');
    l = pushRecent(l, 'b');
    l = pushRecent(l, 'a'); // moves to front
    expect(l).toEqual(['a', 'b']);
    const capped = pushRecent(['1', '2', '3', '4', '5'], 'new', 5);
    expect(capped).toHaveLength(5);
    expect(capped[0]).toBe('new');
  });
  it('ignores empty terms', () => {
    expect(pushRecent(['a'], '  ')).toEqual(['a']);
  });
});
