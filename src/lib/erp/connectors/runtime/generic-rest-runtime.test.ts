import { describe, it, expect } from 'vitest';
import { getByPath, mapRecord, pullGenericRest, pushGenericRest } from './generic-rest-runtime';

describe('generic-rest runtime — helpers', () => {
  it('getByPath navigates dot paths', () => {
    expect(getByPath({ data: { items: [1, 2] } }, 'data.items')).toEqual([1, 2]);
    expect(getByPath({ a: 1 }, '')).toEqual({ a: 1 });
    expect(getByPath({ a: 1 }, 'x.y')).toBeUndefined();
  });
  it('mapRecord renames keys via field map (identity when none)', () => {
    expect(mapRecord({ Name: 'A', Code: 'C' }, { Name: 'name', Code: 'code' })).toEqual({ name: 'A', code: 'C' });
    expect(mapRecord({ name: 'A' })).toEqual({ name: 'A' });
  });
});

function mockFetch(responses: { ok: boolean; status: number; body: unknown }[]) {
  const calls: { url: string; init?: unknown }[] = [];
  let i = 0;
  const f = async (url: string, init?: unknown) => {
    calls.push({ url, init });
    const r = responses[Math.min(i++, responses.length - 1)];
    return { ok: r.ok, status: r.status, json: async () => r.body, text: async () => JSON.stringify(r.body) };
  };
  return { f, calls };
}

describe('generic-rest runtime — pull', () => {
  it('fetches, extracts records_path, maps fields, computes cursor, and sends auth', async () => {
    const { f, calls } = mockFetch([{ ok: true, status: 200, body: { data: [
      { Name: 'Acme', ExtId: 'a1', Updated: '2026-01-02' },
      { Name: 'Globex', ExtId: 'a2', Updated: '2026-01-05' },
    ] } }]);
    const res = await pullGenericRest({
      baseUrl: 'https://api.example.com/', path: '/customers', recordsPath: 'data',
      authHeader: 'Authorization', authScheme: 'Bearer', token: 'tok123',
      cursorParam: 'since', cursor: '2026-01-01', cursorField: 'Updated',
      fieldMap: { Name: 'name', ExtId: 'external_id', Updated: 'Updated' },
      fetchImpl: f,
    });
    expect(res.records).toHaveLength(2);
    expect(res.records[0]).toMatchObject({ name: 'Acme', external_id: 'a1' });
    expect(res.cursorAfter).toBe('2026-01-05');
    // URL carries the cursor param; auth header present
    expect(calls[0].url).toBe('https://api.example.com/customers?since=2026-01-01');
    expect((calls[0].init as { headers: Record<string, string> }).headers.Authorization).toBe('Bearer tok123');
  });
  it('throws on non-2xx', async () => {
    const { f } = mockFetch([{ ok: false, status: 500, body: {} }]);
    await expect(pullGenericRest({ baseUrl: 'https://x.io', fetchImpl: f })).rejects.toThrow(/HTTP 500/);
  });
  it('falls back to a top-level array when no records_path', async () => {
    const { f } = mockFetch([{ ok: true, status: 200, body: [{ name: 'X' }] }]);
    const res = await pullGenericRest({ baseUrl: 'https://x.io', fetchImpl: f });
    expect(res.records).toEqual([{ name: 'X' }]);
  });
});

describe('generic-rest runtime — push', () => {
  it('posts each record and counts sent/failed', async () => {
    const { f, calls } = mockFetch([
      { ok: true, status: 200, body: {} },
      { ok: false, status: 422, body: {} },
    ]);
    const res = await pushGenericRest({ baseUrl: 'https://x.io', path: '/c', token: 't', authScheme: 'Bearer', records: [{ a: 1 }, { a: 2 }], fetchImpl: f });
    expect(res).toEqual({ sent: 1, failed: 1 });
    expect(calls[0].url).toBe('https://x.io/c');
    expect((calls[0].init as { method: string }).method).toBe('POST');
  });
});
