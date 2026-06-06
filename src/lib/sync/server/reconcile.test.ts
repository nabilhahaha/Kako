import { describe, it, expect } from 'vitest';
import {
  reconcile, reconcileBackoffMs, RECONCILE_MAX_ATTEMPTS,
  type ReconcileDeps, type ReconcileHandler, type MirrorRecord, type ReconcileState,
} from './reconcile';

interface Ledger { status: ReconcileState['status']; attempts: number; businessId?: string | null; error?: string; nextAttemptAt?: number; deadLetter?: boolean }

class FakeDeps implements ReconcileDeps {
  rows: MirrorRecord[] = [];
  ledger = new Map<string, Ledger>();
  log: { pk: string; status: string }[] = [];
  private k = (r: MirrorRecord) => `${r.companyId}|${r.entity}|${r.pk}`;

  async due(limit: number) {
    return this.rows.filter((r) => {
      const l = this.ledger.get(this.k(r));
      return !l || l.status === 'pending' || l.status === 'failed';
    }).slice(0, limit);
  }
  async getState(r: MirrorRecord) {
    const l = this.ledger.get(this.k(r));
    return l ? { status: l.status, attempts: l.attempts } : null;
  }
  async markDone(r: MirrorRecord, businessId: string | null, attempts: number) {
    this.ledger.set(this.k(r), { status: 'done', attempts, businessId });
    this.log.push({ pk: r.pk, status: 'done' });
  }
  async markFailed(r: MirrorRecord, attempts: number, error: string, nextAttemptAt: number, deadLetter: boolean) {
    this.ledger.set(this.k(r), { status: 'failed', attempts, error, nextAttemptAt, deadLetter });
    this.log.push({ pk: r.pk, status: deadLetter ? 'dead-letter' : 'failed' });
  }
  async markSkipped(r: MirrorRecord, reason: string) {
    this.ledger.set(this.k(r), { status: 'skipped', attempts: 0, error: reason });
    this.log.push({ pk: r.pk, status: 'skipped' });
  }
}

const rec = (pk: string, entity = 'customers'): MirrorRecord =>
  ({ companyId: 'co1', entity, pk, data: { name: 'X' }, deleted: false });

// A handler that records a real business row keyed by pk → idempotent by construction.
function fakeHandler(store: Set<string>, opts: { fail?: boolean } = {}): ReconcileHandler {
  return {
    async materialize(r) {
      if (opts.fail) throw new Error('materialize failed');
      store.add(r.pk);          // ON CONFLICT (id) DO NOTHING analogue
      return { businessId: r.pk };
    },
  };
}

describe('reconcile engine', () => {
  it('materializes a pending record and records the business id (done)', async () => {
    const d = new FakeDeps(); d.rows = [rec('a')];
    const store = new Set<string>();
    const out = await reconcile(d, { customers: fakeHandler(store) });
    expect(out).toEqual([{ companyId: 'co1', entity: 'customers', pk: 'a', status: 'done', businessId: 'a' }]);
    expect(store.has('a')).toBe(true);
  });

  it('is idempotent: a second run does not re-materialize a done record (no double create)', async () => {
    const d = new FakeDeps(); d.rows = [rec('a')];
    const store = new Set<string>();
    let calls = 0;
    const counting: ReconcileHandler = { async materialize(r) { calls++; store.add(r.pk); return { businessId: r.pk }; } };
    await reconcile(d, { customers: counting });
    const out2 = await reconcile(d, { customers: counting });
    expect(calls).toBe(1);                 // handler ran exactly once
    expect(out2).toEqual([]);              // due() excludes done records → nothing reprocessed
  });

  it('short-circuits a record that became done concurrently (race) without re-running the handler', async () => {
    const d = new FakeDeps(); d.rows = [rec('a')];
    d.ledger.set('co1|customers|a', { status: 'done', attempts: 1, businessId: 'a' });
    d.due = async () => d.rows;            // force it to surface even though done (race)
    let calls = 0;
    const out = await reconcile(d, { customers: { async materialize(r) { calls++; return { businessId: r.pk }; } } });
    expect(calls).toBe(0);
    expect(out[0]).toMatchObject({ status: 'done', alreadyDone: true });
  });

  it('parks records with no registered handler (skipped, not silently done)', async () => {
    const d = new FakeDeps(); d.rows = [rec('o1', 'orders')];
    const out = await reconcile(d, {});                       // no orders handler
    expect(out[0]).toMatchObject({ status: 'skipped', reason: 'no-handler' });
    expect((await d.getState(rec('o1', 'orders')))!.status).toBe('skipped');
  });

  it('a failure is retriable with backoff, then dead-letters at the cap', async () => {
    const d = new FakeDeps(); d.rows = [rec('a')];
    const store = new Set<string>();
    const failing = fakeHandler(store, { fail: true });
    let out;
    for (let i = 0; i < RECONCILE_MAX_ATTEMPTS; i++) {
      out = await reconcile(d, { customers: failing }, { now: 1_000 });
    }
    expect(out![0]).toMatchObject({ status: 'failed', deadLetter: true });
    expect(store.size).toBe(0);                               // never created on failure
    const log = d.log.filter((l) => l.pk === 'a');
    expect(log.at(-1)!.status).toBe('dead-letter');
  });

  it('recovers: a failed record succeeds on a later attempt (exactly once)', async () => {
    const d = new FakeDeps(); d.rows = [rec('a')];
    const store = new Set<string>();
    await reconcile(d, { customers: fakeHandler(store, { fail: true }) }, { now: 1_000 });
    expect((await d.getState(rec('a')))!.status).toBe('failed');
    const out = await reconcile(d, { customers: fakeHandler(store) }, { now: 1_000 });
    expect(out[0]).toMatchObject({ status: 'done' });
    expect(store.has('a')).toBe(true);
  });

  it('backoff grows then caps at one hour', () => {
    expect(reconcileBackoffMs(1)).toBe(30_000);
    expect(reconcileBackoffMs(2)).toBe(60_000);
    expect(reconcileBackoffMs(99)).toBe(60 * 60_000);
  });
});
