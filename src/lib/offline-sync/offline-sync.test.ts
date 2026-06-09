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
    expect(isApplicable('collection', 'create')).toBe(true);
    expect(isApplicable('collection', 'delete')).toBe(false);
    expect(isApplicable('survey', 'create')).toBe(true);
    expect(isApplicable('invoice', 'create')).toBe(false);
    expect(applicableEntities()).toContain('van_expense');
    expect(applicableEntities()).toContain('visit_checkin');
    expect(applicableEntities()).toContain('collection');
    expect(applicableEntities()).toContain('survey');
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

describe('offline-sync/client (retry backoff)', () => {
  it('nextBackoffMs is exponential and capped at 5m', async () => {
    const { nextBackoffMs, MAX_SYNC_ATTEMPTS } = await import('./client');
    expect(nextBackoffMs(1)).toBe(2000);
    expect(nextBackoffMs(2)).toBe(4000);
    expect(nextBackoffMs(3)).toBe(8000);
    expect(nextBackoffMs(20)).toBe(5 * 60 * 1000);   // capped
    expect(nextBackoffMs(0)).toBe(2000);             // guards attempt<1
    expect(MAX_SYNC_ATTEMPTS).toBeGreaterThanOrEqual(3);
  });
});

describe('offline-sync/media (image fit math)', () => {
  it('fitDimensions caps the long edge and preserves aspect ratio', async () => {
    const { fitDimensions } = await import('./media');
    expect(fitDimensions(800, 600, 1280)).toEqual({ width: 800, height: 600 });   // smaller → unchanged
    expect(fitDimensions(4000, 3000, 1280)).toEqual({ width: 1280, height: 960 }); // landscape capped
    expect(fitDimensions(3000, 4000, 1280)).toEqual({ width: 960, height: 1280 }); // portrait capped
    expect(fitDimensions(0, 0, 1280)).toEqual({ width: 1, height: 1 });            // guards div-by-zero
  });
});

describe('offline-sync/media (intake field selection)', () => {
  const base = { blob: new Blob(), fileName: 'p.jpg', mimeType: 'image/jpeg', createdAt: 't' };
  it('direct-entity target sends reference_type/reference_id (and wins over visit fields)', async () => {
    const { mediaUploadFields } = await import('./media');
    expect(mediaUploadFields({ id: 'c1', referenceType: 'van_load_confirmation', referenceId: 'CONF1', ...base }))
      .toEqual({ client_ref: 'c1', reference_type: 'van_load_confirmation', reference_id: 'CONF1' });
    // a stray customer/visit alongside a direct target is ignored
    expect(mediaUploadFields({ id: 'c2', referenceType: 'sales_return', referenceId: 'R1', customerId: 'X', visitDate: 'D', ...base }))
      .toEqual({ client_ref: 'c2', reference_type: 'sales_return', reference_id: 'R1' });
  });
  it('visit target sends customer_id/visit_date', async () => {
    const { mediaUploadFields } = await import('./media');
    expect(mediaUploadFields({ id: 'v1', customerId: 'C1', visitDate: '2026-06-09', ...base }))
      .toEqual({ client_ref: 'v1', customer_id: 'C1', visit_date: '2026-06-09' });
  });
});

describe('erp/attachments (field-media allowlist)', () => {
  it('allows field entities and rejects others', async () => {
    const { isFieldMediaEntity, FIELD_MEDIA_ENTITIES } = await import('@/lib/erp/attachments');
    for (const e of ['visit', 'customer', 'van_load_confirmation', 'sales_return', 'merchandising_audit', 'route_ride']) {
      expect(isFieldMediaEntity(e)).toBe(true);
    }
    expect(isFieldMediaEntity('invoice')).toBe(false);
    expect(isFieldMediaEntity('payment')).toBe(false);
    expect(FIELD_MEDIA_ENTITIES).toContain('van_load_confirmation');
  });
});
