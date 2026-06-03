import { describe, it, expect } from 'vitest';
import { parseListParams, buildOrIlike, pageCount, applySearch, parseSort, recommendedCountMode, DEFAULT_PAGE_SIZE } from './list-query';

describe('list-query · parseListParams', () => {
  it('defaults to page 1 / empty q / page 0-based range', () => {
    const p = parseListParams(undefined);
    expect(p).toEqual({ page: 1, q: '', pageSize: DEFAULT_PAGE_SIZE, from: 0, to: DEFAULT_PAGE_SIZE - 1 });
  });
  it('computes range from page + custom size; trims q; clamps page ≥ 1', () => {
    expect(parseListParams({ page: '3', q: '  abc ' }, 20)).toEqual({ page: 3, q: 'abc', pageSize: 20, from: 40, to: 59 });
    expect(parseListParams({ page: '0' }).page).toBe(1);
    expect(parseListParams({ page: '-5' }).page).toBe(1);
    expect(parseListParams({ page: 'x' }).page).toBe(1);
  });
});

describe('list-query · buildOrIlike', () => {
  it('builds an or-ilike across columns', () => {
    expect(buildOrIlike('acme', ['code', 'name'])).toBe('code.ilike.%acme%,name.ilike.%acme%');
  });
  it('returns null for empty input', () => {
    expect(buildOrIlike('', ['code'])).toBeNull();
    expect(buildOrIlike('x', [])).toBeNull();
  });
  it('strips characters that would break the or() grammar', () => {
    expect(buildOrIlike('a,(b)*c%', ['name'])).toBe('name.ilike.%a b c%');
  });
});

describe('list-query · applySearch', () => {
  it('calls .or() with the built expression; no-op when empty', () => {
    let captured = '';
    const fake = { or(f: string) { captured = f; return this; } };
    applySearch(fake, 'acme', ['code', 'name']);
    expect(captured).toBe('code.ilike.%acme%,name.ilike.%acme%');

    captured = '';
    applySearch(fake, '', ['code']);
    expect(captured).toBe(''); // .or not called
  });
});

describe('list-query · parseSort', () => {
  const allowed = ['code', 'name', 'balance'] as const;
  const def = { column: 'code', ascending: true };
  it('accepts an allow-listed column + direction', () => {
    expect(parseSort({ sort: 'balance', dir: 'desc' }, allowed, def)).toEqual({ column: 'balance', ascending: false });
    expect(parseSort({ sort: 'name' }, allowed, def)).toEqual({ column: 'name', ascending: true });
  });
  it('rejects unknown columns (guards against arbitrary ordering) → default', () => {
    expect(parseSort({ sort: 'password' }, allowed, def)).toEqual(def);
    expect(parseSort(undefined, allowed, def)).toEqual(def);
  });
});

describe('list-query · recommendedCountMode', () => {
  it('exact for small/medium, planned for very large', () => {
    expect(recommendedCountMode(5_000)).toBe('exact');
    expect(recommendedCountMode(2_000_000)).toBe('planned');
  });
});

describe('list-query · pageCount', () => {
  it('rounds up and is at least 1', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(25, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
    expect(pageCount(51, 25)).toBe(3);
  });
});
