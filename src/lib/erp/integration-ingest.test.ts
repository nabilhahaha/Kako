import { describe, it, expect, vi } from 'vitest';

// Neutralise the server-only marker + custom-fields DB resolver so the
// descriptor-driven ingest logic can be unit-tested with a mock client.
vi.mock('server-only', () => ({}));
vi.mock('./custom-fields-server', () => ({ getActiveCustomFields: vi.fn(async () => []) }));

import { ingestRecord } from './integration-ingest';

/** Minimal chainable Supabase mock for one entity table. */
function makeDb(script: { existing?: { id: string } | null; insertId?: string; insertError?: string }) {
  const calls = { insertPayload: null as Record<string, unknown> | null, updatePayload: null as Record<string, unknown> | null, updateScoped: [] as [string, unknown][] };
  const from = () => {
    const b: Record<string, unknown> = {};
    let op: 'select' | 'insert' | 'update' = 'select';
    Object.assign(b, {
      select: () => b,
      eq: (col: string, val: unknown) => { if (op === 'update') calls.updateScoped.push([col, val]); return b; },
      maybeSingle: () => Promise.resolve({ data: script.existing ?? null, error: null }),
      single: () => Promise.resolve(script.insertError ? { data: null, error: { message: script.insertError } } : { data: { id: script.insertId ?? 'new-id' }, error: null }),
      insert: (p: Record<string, unknown>) => { op = 'insert'; calls.insertPayload = p; return b; },
      update: (p: Record<string, unknown>) => { op = 'update'; calls.updatePayload = p; return b; },
      then: (res: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(res),
    });
    return b;
  };
  return { db: { from } as never, calls };
}

describe('ingestRecord — validation', () => {
  it('rejects a missing required field without writing', async () => {
    const { db, calls } = makeDb({});
    const r = await ingestRecord(db, 'co1', 'customer', { external_id: 'a1' }, 'upsert');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/name/i);
    expect(calls.insertPayload).toBeNull();
  });
});

describe('ingestRecord — insert path', () => {
  it('inserts a new record, stamps company_id from the arg, coerces numbers', async () => {
    const { db, calls } = makeDb({ existing: null, insertId: 'cust-9' });
    const r = await ingestRecord(db, 'co1', 'customer', { name: 'Acme', external_id: 'a1', credit_limit: '100' }, 'upsert');
    expect(r).toMatchObject({ ok: true, action: 'inserted', id: 'cust-9' });
    expect(calls.insertPayload).toMatchObject({ company_id: 'co1', name: 'Acme', external_id: 'a1', credit_limit: 100 });
    expect(typeof calls.insertPayload!.credit_limit).toBe('number');
  });

  it('does not overwrite an existing record in insert mode', async () => {
    const { db, calls } = makeDb({ existing: { id: 'x1' } });
    const r = await ingestRecord(db, 'co1', 'customer', { name: 'Acme', external_id: 'a1' }, 'insert');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/already exists/i);
    expect(calls.insertPayload).toBeNull();
    expect(calls.updatePayload).toBeNull();
  });
});

describe('ingestRecord — update path (company-scoped)', () => {
  it('updates an existing record in upsert mode, scoped by company_id', async () => {
    const { db, calls } = makeDb({ existing: { id: 'x1' } });
    const r = await ingestRecord(db, 'co1', 'customer', { name: 'Acme v2', external_id: 'a1' }, 'upsert');
    expect(r).toMatchObject({ ok: true, action: 'updated', id: 'x1' });
    expect(calls.updatePayload).toMatchObject({ company_id: 'co1', name: 'Acme v2' });
    // existence + update both scope by company_id (never trusting the body)
    expect(calls.updateScoped).toEqual(expect.arrayContaining([['id', 'x1'], ['company_id', 'co1']]));
  });
});
