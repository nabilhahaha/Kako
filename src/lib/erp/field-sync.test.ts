import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { syncVisitsWith, normalizeBatch, type VisitAction } from './field-sync';

/** Fake RPC client: records calls, returns scripted data/errors keyed by
 *  client_ref. Lets us assert idempotency, ordering, isolation and the exact
 *  args forwarded to the RPCs (GPS + captured time). */
function fake(script: Record<string, { error?: string; data?: Record<string, unknown> }> = {}, throwOn?: string) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client = {
    calls,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      const ref = String(args.p_client_ref);
      if (throwOn && ref === throwOn) throw new Error('boom');
      const s = script[ref];
      if (s?.error) return { data: null, error: { message: s.error } };
      if (fn === 'erp_fe_visit_start') return { data: s?.data ?? { id: `v-${ref}`, geofence_status: 'ok', distance_m: 0, idempotent: false }, error: null };
      return { data: s?.data ?? { id: `v-${ref}`, duration_min: 20, idempotent: false }, error: null };
    },
  };
  return client;
}

const CAP = '2026-06-01T08:00:00Z';

describe('field-sync · normalizeBatch (duplicate prevention + ordering)', () => {
  it('collapses duplicate (kind+clientRef) and orders starts before ends', () => {
    const batch: VisitAction[] = [
      { kind: 'end', clientRef: 'a', capturedAt: CAP },
      { kind: 'start', clientRef: 'a', customerId: 'c1', capturedAt: CAP },
      { kind: 'start', clientRef: 'a', customerId: 'c1', capturedAt: CAP }, // duplicate
    ];
    const out = normalizeBatch(batch);
    expect(out).toHaveLength(2);                 // duplicate dropped
    expect(out.map((x) => x.kind)).toEqual(['start', 'end']); // start first
  });
});

describe('field-sync · syncVisitsWith', () => {
  it('forwards captured time + GPS to the RPC (no sync-time substitution)', async () => {
    const sb = fake();
    await syncVisitsWith(sb, [{ kind: 'start', clientRef: 'a', customerId: 'c1', lat: 30.1, lng: 31.2, accuracy: 9, capturedAt: CAP, reason: 'r', photo: 'p.jpg' }]);
    expect(sb.calls[0].args).toMatchObject({
      p_client_ref: 'a', p_customer: 'c1', p_lat: 30.1, p_lng: 31.2, p_accuracy: 9,
      p_captured_at: CAP, p_reason: 'r', p_photo: 'p.jpg',
    });
  });

  it('surfaces the idempotent flag (reconnect/retry replay)', async () => {
    const sb = fake({ a: { data: { id: 'v-a', geofence_status: 'ok', distance_m: 0, idempotent: true } } });
    const [r] = await syncVisitsWith(sb, [{ kind: 'start', clientRef: 'a', customerId: 'c1', capturedAt: CAP }]);
    expect(r).toMatchObject({ ok: true, idempotent: true, id: 'v-a', geofenceStatus: 'ok' });
  });

  it('dedupes a retried duplicate before it reaches the DB', async () => {
    const sb = fake();
    const dup: VisitAction = { kind: 'start', clientRef: 'a', customerId: 'c1', capturedAt: CAP };
    const res = await syncVisitsWith(sb, [dup, dup]);
    expect(res).toHaveLength(1);
    expect(sb.calls).toHaveLength(1); // only one RPC despite the duplicate
  });

  it('isolates partial failures — good items still commit', async () => {
    const sb = fake({ b: { error: 'something broke' } });
    const res = await syncVisitsWith(sb, [
      { kind: 'start', clientRef: 'a', customerId: 'c1', capturedAt: CAP },
      { kind: 'start', clientRef: 'b', customerId: 'c2', capturedAt: CAP },
      { kind: 'start', clientRef: 'c', customerId: 'c3', capturedAt: CAP },
    ]);
    expect(res.map((r) => r.ok)).toEqual([true, false, true]);
    expect(res[1].code).toBe('error');
  });

  it('maps RPC messages to stable error codes the client can act on', async () => {
    const sb = fake({
      a: { error: 'reason required for out-of-geofence check-in' },
      b: { error: 'exception photo required' },
      c: { error: 'visit not found' },
    });
    const res = await syncVisitsWith(sb, [
      { kind: 'start', clientRef: 'a', customerId: 'c1', capturedAt: CAP },
      { kind: 'start', clientRef: 'b', customerId: 'c2', capturedAt: CAP },
      { kind: 'end', clientRef: 'c', capturedAt: CAP },
    ]);
    expect(res.map((r) => r.code)).toEqual(['reason_required', 'photo_required', 'visit_not_found']);
  });

  it('rejects invalid items without calling the RPC', async () => {
    const sb = fake();
    const [r] = await syncVisitsWith(sb, [{ kind: 'start', clientRef: 'a', customerId: '', capturedAt: CAP }]);
    expect(r).toMatchObject({ ok: false, code: 'invalid' });
    expect(sb.calls).toHaveLength(0);
  });

  it('a thrown RPC error never aborts the batch', async () => {
    const sb = fake({}, 'b');
    const res = await syncVisitsWith(sb, [
      { kind: 'start', clientRef: 'a', customerId: 'c1', capturedAt: CAP },
      { kind: 'start', clientRef: 'b', customerId: 'c2', capturedAt: CAP },
      { kind: 'start', clientRef: 'c', customerId: 'c3', capturedAt: CAP },
    ]);
    expect(res.map((r) => r.ok)).toEqual([true, false, true]);
    expect(res[1].error).toBe('boom');
  });
});
