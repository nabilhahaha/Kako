import { describe, it, expect } from 'vitest';
import {
  MOBILE_ENABLED,
  orderMutations, dedupeMutations, filterAlreadyApplied, batchMutations,
  policyFor, resolveMutation, planApply,
  type OfflineMutation, type ServerRecord,
} from './index';

const mut = (over: Partial<OfflineMutation>): OfflineMutation => ({
  idempotencyKey: 'k', deviceId: 'D1', userId: 'U1', entity: 'visit', operation: 'create',
  payload: {}, clientSeq: 1, clientTs: '2026-06-08T10:00:00Z', ...over,
});

describe('offline-sync/flags', () => {
  it('defaults OFF', () => {
    const prev = process.env.KAKO_MOBILE;
    delete process.env.KAKO_MOBILE;
    expect(MOBILE_ENABLED()).toBe(false);
    process.env.KAKO_MOBILE = '1';
    expect(MOBILE_ENABLED()).toBe(true);
    if (prev === undefined) delete process.env.KAKO_MOBILE; else process.env.KAKO_MOBILE = prev;
  });
});

describe('offline-sync/queue', () => {
  it('orders by device + client_seq (causal)', () => {
    const out = orderMutations([
      mut({ idempotencyKey: 'b', clientSeq: 2 }),
      mut({ idempotencyKey: 'a', clientSeq: 1 }),
      mut({ idempotencyKey: 'c', deviceId: 'D0', clientSeq: 5 }),
    ]);
    expect(out.map((m) => m.idempotencyKey)).toEqual(['c', 'a', 'b']); // D0 first, then D1 by seq
  });
  it('dedupes by idempotency key (exactly-once apply)', () => {
    const out = dedupeMutations([mut({ idempotencyKey: 'a' }), mut({ idempotencyKey: 'a', clientSeq: 2 }), mut({ idempotencyKey: 'b', clientSeq: 3 })]);
    expect(out.map((m) => m.idempotencyKey)).toEqual(['a', 'b']);
  });
  it('skips already-applied keys + batches', () => {
    const ms = [mut({ idempotencyKey: 'a' }), mut({ idempotencyKey: 'b', clientSeq: 2 }), mut({ idempotencyKey: 'c', clientSeq: 3 })];
    expect(filterAlreadyApplied(ms, new Set(['a'])).map((m) => m.idempotencyKey)).toEqual(['b', 'c']);
    expect(batchMutations(ms, 2).map((b) => b.length)).toEqual([2, 1]);
  });
});

describe('offline-sync/conflict (policy-driven)', () => {
  it('defaults: ledgered entities are server-authoritative', () => {
    expect(policyFor('visit')).toBe('last_write_wins');
    expect(policyFor('van_cash_reconciliation')).toBe('server_authoritative');
    expect(policyFor('invoice')).toBe('server_authoritative');
  });

  it('create: applies when no server row, conflicts when it exists', () => {
    expect(resolveMutation(mut({ operation: 'create' }), null).resolution).toBe('apply');
    expect(resolveMutation(mut({ operation: 'create' }), { entity: 'visit', entityId: 'V1', version: 'x', fields: {} }).resolution).toBe('conflict');
  });

  it('server-authoritative update → conflict (device cannot overwrite ledger)', () => {
    const m = mut({ entity: 'invoice', operation: 'update', entityId: 'INV1', payload: { total: 999 } });
    const server: ServerRecord = { entity: 'invoice', entityId: 'INV1', version: 'v2', fields: { total: 100 } };
    expect(resolveMutation(m, server).resolution).toBe('conflict');
  });

  it('LWW update: clean apply when base matches; field-merge when client newer; conflict when server newer', () => {
    const server: ServerRecord = { entity: 'visit', entityId: 'V1', version: '2026-06-08T09:00:00Z', fields: { notes: 'old', flag: true } };
    const clean = resolveMutation(mut({ operation: 'update', entityId: 'V1', baseVersion: '2026-06-08T09:00:00Z', payload: { notes: 'new' }, clientTs: '2026-06-08T10:00:00Z' }), server);
    expect(clean.resolution).toBe('apply');
    expect(clean.effectiveFields).toEqual({ notes: 'new', flag: true });   // merged
    const newer = resolveMutation(mut({ operation: 'update', entityId: 'V1', baseVersion: 'stale', payload: { notes: 'n2' }, clientTs: '2026-06-08T11:00:00Z' }), server);
    expect(newer.resolution).toBe('apply');                                 // client newer than server version
    const older = resolveMutation(mut({ operation: 'update', entityId: 'V1', baseVersion: 'stale', payload: { notes: 'n3' }, clientTs: '2026-06-08T08:00:00Z' }), server);
    expect(older.resolution).toBe('conflict');                              // server newer
  });

  it('planApply splits a batch into apply/conflicts/rejected', () => {
    const ms = [
      mut({ idempotencyKey: 'a', operation: 'create', entity: 'visit' }),
      mut({ idempotencyKey: 'b', operation: 'update', entity: 'invoice', entityId: 'INV1', payload: { x: 1 } }),
      mut({ idempotencyKey: 'c', operation: 'update', entity: 'visit', entityId: 'NOPE', payload: { x: 1 } }),
    ];
    const plan = planApply(ms, (m) => (m.entityId === 'INV1' ? { entity: 'invoice', entityId: 'INV1', version: 'v', fields: {} } : null));
    expect(plan.apply.map((r) => r.idempotencyKey)).toEqual(['a']);
    expect(plan.conflicts.map((r) => r.idempotencyKey)).toEqual(['b']);
    expect(plan.rejected.map((r) => r.idempotencyKey)).toEqual(['c']);
  });
});

describe('offline-sync/apply (safe server whitelist)', () => {
  it('only whitelisted (entity, op) auto-apply', async () => {
    const { isApplicable, applicableEntities } = await import('./apply');
    expect(isApplicable('van_expense', 'create')).toBe(true);
    expect(isApplicable('van_expense', 'delete')).toBe(false);
    expect(isApplicable('visit_checkin', 'create')).toBe(true);
    expect(isApplicable('visit_checkin', 'update')).toBe(false);
    expect(isApplicable('invoice', 'create')).toBe(false);
    expect(applicableEntities()).toContain('van_expense');
    expect(applicableEntities()).toContain('visit_checkin');
  });

  it('mapVisitVerdict ranks blocked > gps_violation > out_of_route > valid', async () => {
    const { mapVisitVerdict } = await import('./apply');
    expect(mapVisitVerdict({})).toBe('valid');
    expect(mapVisitVerdict({ out_of_route: true })).toBe('out_of_route');
    expect(mapVisitVerdict({ violation: true })).toBe('gps_violation');
    expect(mapVisitVerdict({ violation: true, out_of_route: true })).toBe('gps_violation');
    expect(mapVisitVerdict({ blocked: true, violation: true })).toBe('blocked');
  });
});
