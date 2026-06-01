import { describe, it, expect, vi } from 'vitest';

// Neutralise the server-only marker so the effect logic can be unit-tested.
vi.mock('server-only', () => ({}));

import { applyFormEffect } from './form-effects';

/** Unit coverage for the whitelisted B6 effect executor. A tiny fake Supabase
 *  client records writes/audit calls and feeds preset submission + effect rows,
 *  so we can assert each branch (whitelist gate, target allowlist, GPS parse,
 *  customer creation) without a database. */

interface Sub { id: string; company_id: string; form_id: string; record_id: string | null; values: Record<string, unknown>; }
interface Effect { type?: string; [k: string]: unknown }

function makeClient(submission: Sub, effect: Effect, opts: { insertError?: string } = {}) {
  const calls = {
    updates: [] as { table: string; payload: Record<string, unknown>; filters: Record<string, unknown> }[],
    inserts: [] as { table: string; payload: Record<string, unknown> }[],
    audits: [] as Record<string, unknown>[],
  };
  function builder(table: string) {
    const state: { op: string; payload: Record<string, unknown>; filters: Record<string, unknown> } = { op: '', payload: {}, filters: {} };
    const b: Record<string, unknown> = {
      select() { state.op = state.op || 'select'; return b; },
      insert(row: Record<string, unknown>) { state.op = 'insert'; state.payload = row; return b; },
      update(payload: Record<string, unknown>) { state.op = 'update'; state.payload = payload; return b; },
      eq(col: string, val: unknown) { state.filters[col] = val; return b; },
      single() { return resolve(); },
      maybeSingle() { return resolve(); },
      then(onF: (v: { data: unknown; error: unknown }) => unknown) {
        // update path is awaited directly (no single())
        if (state.op === 'update') {
          calls.updates.push({ table, payload: state.payload, filters: state.filters });
        }
        return Promise.resolve({ data: null, error: null }).then(onF);
      },
    };
    function resolve() {
      if (table === 'erp_form_submissions' && state.op === 'select') return Promise.resolve({ data: submission, error: null });
      if (table === 'erp_form_definitions') return Promise.resolve({ data: { effect }, error: null });
      if (table === 'erp_customers' && state.op === 'insert') {
        calls.inserts.push({ table, payload: state.payload });
        return Promise.resolve(opts.insertError ? { data: null, error: { message: opts.insertError } } : { data: { id: 'cust-new' }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    }
    return b;
  }
  const client = {
    from: (table: string) => builder(table),
    rpc: (fn: string, args: Record<string, unknown>) => { if (fn === 'erp_log_audit') calls.audits.push(args); return Promise.resolve({ data: null, error: null }); },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, calls };
}

const baseSub = (over: Partial<Sub> = {}): Sub => ({ id: 's1', company_id: 'co1', form_id: 'f1', record_id: null, values: {}, ...over });

describe('applyFormEffect (B6 whitelisted effects)', () => {
  it('record_only is a no-op that still audits', async () => {
    const { client, calls } = makeClient(baseSub(), { type: 'record_only' });
    const r = await applyFormEffect(client, 's1');
    expect(r.applied).toBe(true);
    expect(r.effect).toBe('record_only');
    expect(calls.audits.some((a) => a.p_action === 'form_effect')).toBe(true);
    expect(calls.updates).toHaveLength(0);
  });

  it('rejects a non-whitelisted effect', async () => {
    const { client, calls } = makeClient(baseSub(), { type: 'set_credit_limit' });
    const r = await applyFormEffect(client, 's1');
    expect(r.applied).toBe(false);
    expect(calls.audits.some((a) => a.p_action === 'form_effect_rejected')).toBe(true);
  });

  it('update_field writes an allowed column on the target record', async () => {
    const { client, calls } = makeClient(
      baseSub({ record_id: 'cust-9', values: { p: '0100' } }),
      { type: 'update_field', table: 'erp_customers', column: 'phone', value_from: 'p' },
    );
    const r = await applyFormEffect(client, 's1');
    expect(r.applied).toBe(true);
    expect(calls.updates[0]).toMatchObject({ table: 'erp_customers', payload: { phone: '0100' }, filters: { id: 'cust-9', company_id: 'co1' } });
  });

  it('update_field refuses a non-whitelisted column (e.g. credit_limit)', async () => {
    const { client, calls } = makeClient(
      baseSub({ record_id: 'cust-9', values: { x: '999' } }),
      { type: 'update_field', table: 'erp_customers', column: 'credit_limit', value_from: 'x' },
    );
    const r = await applyFormEffect(client, 's1');
    expect(r.applied).toBe(false);
    expect(calls.updates).toHaveLength(0);
    expect(calls.audits.some((a) => a.p_action === 'form_effect_rejected')).toBe(true);
  });

  it('update_field needs a target record', async () => {
    const { client } = makeClient(baseSub({ values: { p: '1' } }), { type: 'update_field', table: 'erp_customers', column: 'phone', value_from: 'p' });
    const r = await applyFormEffect(client, 's1');
    expect(r.applied).toBe(false);
    expect(r.error).toMatch(/target/);
  });

  it('set_gps parses "lat,lng" and writes both columns', async () => {
    const { client, calls } = makeClient(
      baseSub({ record_id: 'cust-9', values: { loc: '30.1,31.2' } }),
      { type: 'set_gps', table: 'erp_customers', value_from: 'loc' },
    );
    const r = await applyFormEffect(client, 's1');
    expect(r.applied).toBe(true);
    expect(calls.updates[0].payload).toMatchObject({ latitude: 30.1, longitude: 31.2 });
  });

  it('set_gps rejects a malformed value', async () => {
    const { client } = makeClient(baseSub({ record_id: 'cust-9', values: { loc: 'oops' } }), { type: 'set_gps', table: 'erp_customers', value_from: 'loc' });
    const r = await applyFormEffect(client, 's1');
    expect(r.applied).toBe(false);
  });

  it('create_customer maps whitelisted fields and back-fills record_id', async () => {
    const { client, calls } = makeClient(
      baseSub({ values: { n: 'Acme', p: '0100' } }),
      { type: 'create_customer', map: { name: 'n', phone: 'p' } },
    );
    const r = await applyFormEffect(client, 's1');
    expect(r.applied).toBe(true);
    expect(r.recordId).toBe('cust-new');
    expect(calls.inserts[0].payload).toMatchObject({ name: 'Acme', phone: '0100', company_id: 'co1', is_approved: false });
    expect(String(calls.inserts[0].payload.code)).toMatch(/^FRM-/);
    // record_id back-filled onto the submission
    expect(calls.updates.some((u) => u.table === 'erp_form_submissions' && u.payload.record_id === 'cust-new')).toBe(true);
  });

  it('create_customer requires a name', async () => {
    const { client } = makeClient(baseSub({ values: { p: '0100' } }), { type: 'create_customer', map: { phone: 'p' } });
    const r = await applyFormEffect(client, 's1');
    expect(r.applied).toBe(false);
    expect(r.error).toMatch(/name/);
  });
});
