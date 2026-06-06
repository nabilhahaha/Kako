import { describe, it, expect } from 'vitest';
import { applyPush, type ApplyDeps, type IngestRecord, type PushedOp } from './apply';
import type { RemoteRecord } from '../types';

class FakeDeps implements ApplyDeps {
  ingest = new Set<string>();
  rows = new Map<string, RemoteRecord>();
  reviews: { pk: string }[] = [];
  failCommitPk = new Set<string>();
  commits = 0;

  async hasIngest(id: string) { return this.ingest.has(id); }
  async getRemote(e: string, pk: string) { return this.rows.get(`${e}|${pk}`) ?? null; }
  async commit(row: RemoteRecord, ingest: IngestRecord) {
    if (this.failCommitPk.has(row.pk)) throw new Error('db down');
    this.commits++;
    this.rows.set(`${row.entity}|${row.pk}`, row);
    this.ingest.add(ingest.clientOpId);           // atomic with the row
    return { version: row.version };
  }
  async flagReview(op: PushedOp) { this.reviews.push({ pk: op.pk }); }
}

const op = (o: Partial<PushedOp> & Pick<PushedOp, 'clientOpId' | 'entity' | 'pk'>): PushedOp => ({
  op: 'update', payload: {}, baseVersion: null, ...o,
});

describe('server applyPush — exactly-once + §14 conflict matrix', () => {
  it('is idempotent: replaying the same clientOpId never double-applies', async () => {
    const d = new FakeDeps();
    const ops = [op({ clientOpId: 'A', entity: 'orders', pk: 'o1', op: 'insert', payload: { t: 1 } })];
    const r1 = await applyPush(ops, d, 100);
    const r2 = await applyPush(ops, d, 200);     // retry (e.g. lost ack)
    expect(r1[0].status).toBe('ok');
    expect(r2[0].status).toBe('ok');
    expect(d.commits).toBe(1);                    // applied exactly once
    expect(d.rows.size).toBe(1);
  });

  it('append-only entities always insert (no overwrite)', async () => {
    const d = new FakeDeps();
    const r = await applyPush([op({ clientOpId: 'A', entity: 'visits', pk: 'v1', op: 'insert', payload: { x: 1 } })], d, 1);
    expect(r[0]).toMatchObject({ status: 'ok', version: 1 });
  });

  it('LWW: cloud-newer ⇒ conflict (no overwrite); client-newer ⇒ applied', async () => {
    const d = new FakeDeps();
    d.rows.set('products|p1', { entity: 'products', pk: 'p1', version: 5, updatedAt: 1000, origin: 'cloud', deleted: false, data: { price: 9 } });

    const cloudNewer = await applyPush([op({ clientOpId: 'A', entity: 'products', pk: 'p1', payload: { price: 7 }, updatedAt: 500 })], d, 1);
    expect(cloudNewer[0].status).toBe('conflict');
    expect(d.commits).toBe(0);

    const clientNewer = await applyPush([op({ clientOpId: 'B', entity: 'products', pk: 'p1', payload: { price: 7 }, updatedAt: 2000 })], d, 1);
    expect(clientNewer[0].status).toBe('ok');
    expect(d.rows.get('products|p1')!.data).toEqual({ price: 7 });
  });

  it('field-merge keeps non-conflicting fields from both sides', async () => {
    const d = new FakeDeps();
    d.rows.set('customers|c1', { entity: 'customers', pk: 'c1', version: 2, updatedAt: 10, origin: 'cloud', deleted: false, data: { name: 'A', phone: '111' } });
    const r = await applyPush([op({ clientOpId: 'A', entity: 'customers', pk: 'c1', payload: { name: 'A', phone: '222' }, updatedAt: 20 })], d, 1);
    expect(r[0].status).toBe('ok');
    expect(d.rows.get('customers|c1')!.data).toMatchObject({ phone: '222' });
  });

  it('review entities park a moved row instead of auto-applying', async () => {
    const d = new FakeDeps();
    d.rows.set('inventory_counts|i1', { entity: 'inventory_counts', pk: 'i1', version: 3, updatedAt: 10, origin: 'cloud', deleted: false, data: { qty: 100 } });
    const r = await applyPush([op({ clientOpId: 'A', entity: 'inventory_counts', pk: 'i1', payload: { qty: 90 }, baseVersion: 1 })], d, 1);
    expect(r[0].status).toBe('conflict');
    expect(d.reviews).toHaveLength(1);
    expect(d.commits).toBe(0);
  });

  it('fault injection: a commit failure is a retryable error, not a duplicate', async () => {
    const d = new FakeDeps();
    d.failCommitPk.add('o1');
    const ops = [op({ clientOpId: 'A', entity: 'orders', pk: 'o1', op: 'insert', payload: { t: 1 } })];
    const r1 = await applyPush(ops, d, 1);
    expect(r1[0].status).toBe('error');
    expect(d.ingest.has('A')).toBe(false);        // NOT recorded → safe to retry
    expect(d.rows.size).toBe(0);

    d.failCommitPk.clear();                        // "db" recovers
    const r2 = await applyPush(ops, d, 2);
    expect(r2[0].status).toBe('ok');
    expect(d.commits).toBe(1);                     // applied exactly once overall
  });
});
