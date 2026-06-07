import { describe, it, expect } from 'vitest';
import { lastWriteWins, fieldMerge, resolveConflict, type LocalRecord } from './conflict';
import type { RemoteRecord } from './types';

const local = (over: Partial<LocalRecord> = {}): LocalRecord => ({
  pk: 'r1', version: 1, updatedAt: 1000, origin: 'local', deleted: false, data: { a: 1, b: 2 }, ...over,
});
const remote = (over: Partial<RemoteRecord> = {}): RemoteRecord => ({
  entity: 'e', pk: 'r1', version: 1, updatedAt: 1000, origin: 'cloud', deleted: false, data: { a: 1, b: 2 }, ...over,
});

describe('sync/conflict — last-write-wins', () => {
  it('newer updatedAt wins (both directions)', () => {
    expect(lastWriteWins(local({ updatedAt: 2000 }), remote({ updatedAt: 1000 })).winner).toBe('local');
    expect(lastWriteWins(local({ updatedAt: 1000 }), remote({ updatedAt: 2000 })).winner).toBe('remote');
  });

  it('is deterministic on ties (version, then cloud origin)', () => {
    expect(lastWriteWins(local({ version: 1 }), remote({ version: 2 })).winner).toBe('remote');
    expect(lastWriteWins(local({ version: 3 }), remote({ version: 2 })).winner).toBe('local');
    // fully equal → converge on remote (cloud), deterministically
    expect(lastWriteWins(local(), remote()).winner).toBe('remote');
  });

  it('propagates a remote tombstone when remote is newer', () => {
    const res = lastWriteWins(local({ updatedAt: 1000 }), remote({ updatedAt: 5000, deleted: true }));
    expect(res.winner).toBe('remote');
    expect(res.deleted).toBe(true);
  });
});

describe('sync/conflict — field merge', () => {
  it('merges non-overlapping field edits', () => {
    const base = { a: 1, b: 2 };
    const l = local({ data: { a: 9, b: 2 }, updatedAt: 1000 }); // changed a
    const r = remote({ data: { a: 1, b: 8 }, updatedAt: 1001 }); // changed b
    const res = fieldMerge(base, l, r);
    expect(res.winner).toBe('merged');
    expect(res.data).toEqual({ a: 9, b: 8 });
  });

  it('falls back to LWW for a field both sides changed', () => {
    const base = { a: 1 };
    const l = local({ data: { a: 2 }, updatedAt: 1000 });
    const r = remote({ data: { a: 3 }, updatedAt: 2000 }); // remote newer
    expect(fieldMerge(base, l, r).data).toEqual({ a: 3 });
  });

  it('resolves deletes via LWW', () => {
    const res = fieldMerge({ a: 1 }, local({ updatedAt: 1000 }), remote({ updatedAt: 5000, deleted: true }));
    expect(res.deleted).toBe(true);
  });
});

describe('sync/conflict — resolveConflict policies', () => {
  it('server-wins / client-wins are explicit', () => {
    expect(resolveConflict('server-wins', local({ updatedAt: 9999 }), remote()).winner).toBe('remote');
    expect(resolveConflict('client-wins', local(), remote({ updatedAt: 9999 })).winner).toBe('local');
  });
  it('defaults to last-write-wins', () => {
    expect(resolveConflict('last-write-wins', local({ updatedAt: 1 }), remote({ updatedAt: 2 })).winner).toBe('remote');
  });
});
