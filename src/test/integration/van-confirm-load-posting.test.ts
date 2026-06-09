import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * Van Sales (0247) — atomic confirm-load + ledger posting. Proves: only accepted
 * qty posts (warehouse → van), full reject posts nothing, accepted > loaded is
 * rejected, an unauthorized salesman can't post another's load, a mid-flow failure
 * rolls the whole confirmation back, and duplicate confirm is idempotent.
 * Gated on TEST_DATABASE_URL.
 */

interface Fixture { company: string; branch: string; salesman: string; src: string; van: string; p1: string; manifest: string }

async function mkUser(c: Client, branch: string, role: string): Promise<string> {
  const id = randomUUID();
  await c.query('insert into auth.users(id, email) values ($1,$2)', [id, `u+${id}@test.local`]);
  await c.query('insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,$3,true)', [id, branch, role]);
  return id;
}

async function setup(c: Client, opts: { withSource?: boolean; direct?: boolean } = {}): Promise<Fixture> {
  const sfx = randomUUID().slice(0, 8);
  const company = (await c.query("insert into erp_companies(name) values('VCL') returning id")).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ','HQ') returning id", [company])).rows[0].id;
  const salesman = await mkUser(c, branch, 'salesman');
  const src = (await c.query("insert into erp_warehouses(branch_id,code,name) values ($1,$2,'Source') returning id", [branch, `WH-${sfx}`])).rows[0].id;
  const van = (await c.query("insert into erp_warehouses(branch_id,code,name,is_van) values ($1,$2,'Van',true) returning id", [branch, `VAN-${sfx}`])).rows[0].id;
  const p1 = (await c.query("insert into erp_products_catalog(code,name) values ($1,'P1') returning id", [`P1-${sfx}`])).rows[0].id;
  await c.query('insert into erp_inventory_stock(warehouse_id,product_id,quantity) values ($1,$2,100)', [src, p1]);
  let sr: string | null = null;
  if (opts.withSource !== false) {
    sr = (await c.query("insert into erp_stock_requests(request_number,branch_id,from_warehouse_id,to_warehouse_id) values ($1,$2,$3,$4) returning id", [`SR-${sfx}`, branch, src, van])).rows[0].id;
  }
  // Supervisor-direct loads carry source_warehouse_id and no stock request.
  const sourceCol = opts.direct ? src : null;
  const manifest = (await c.query("insert into erp_van_load_manifests(branch_id,warehouse_id,stock_request_id,source_warehouse_id,salesman_id,status) values ($1,$2,$3,$4,$5,'loaded') returning id", [branch, van, sr, sourceCol, salesman])).rows[0].id;
  return { company, branch, salesman, src, van, p1, manifest };
}

const lines = (f: Fixture, loaded: number, accepted: number, reason: string | null = null) =>
  JSON.stringify([{ product_id: f.p1, loaded_qty: loaded, accepted_qty: accepted, variance_reason: reason }]);

const confCount = async (c: Client, manifest: string) =>
  Number((await c.query('select count(*)::int n from erp_van_load_confirmations where manifest_id=$1', [manifest])).rows[0].n);
const moveCount = async (c: Client, conf: string) =>
  Number((await c.query("select count(*)::int n from erp_stock_movements where reference_type='van_load_confirmation' and reference_id=$1", [conf])).rows[0].n);

async function call(c: Client, manifest: string, status: string, review: boolean, linesJson: string): Promise<string> {
  return (await c.query('select erp_van_confirm_load($1,$2,$3,$4,$5::jsonb) as id', [manifest, status, review, null, linesJson])).rows[0].id;
}

describe.skipIf(!hasTestDb)('van-sales · atomic confirm load posting', () => {
  it('accept_partial posts accepted qty warehouse→van; rejected qty stays', async () => {
    await withRollback(async (c) => {
      const f = await setup(c);
      await actAs(c, f.salesman);
      const conf = await call(c, f.manifest, 'accept_partial', true, lines(f, 10, 8, 'short'));
      await resetRole(c);
      expect(await moveCount(c, conf)).toBe(2);
      expect(Number((await c.query('select quantity from erp_inventory_stock where warehouse_id=$1 and product_id=$2', [f.van, f.p1])).rows[0].quantity)).toBe(8);
      expect(Number((await c.query('select quantity from erp_inventory_stock where warehouse_id=$1 and product_id=$2', [f.src, f.p1])).rows[0].quantity)).toBe(92);
      expect(Number((await c.query('select posted_at is not null as p from erp_van_load_confirmations where id=$1', [conf])).rows[0].p ? 1 : 0)).toBe(1);
    });
  }, 30_000);

  it('supervisor-direct load (no request) posts from source_warehouse_id', async () => {
    await withRollback(async (c) => {
      const f = await setup(c, { withSource: false, direct: true });
      await actAs(c, f.salesman);
      const conf = await call(c, f.manifest, 'accept_full', false, lines(f, 10, 10));
      await resetRole(c);
      expect(await moveCount(c, conf)).toBe(2);
      expect(Number((await c.query('select quantity from erp_inventory_stock where warehouse_id=$1 and product_id=$2', [f.van, f.p1])).rows[0].quantity)).toBe(10);
      expect(Number((await c.query('select quantity from erp_inventory_stock where warehouse_id=$1 and product_id=$2', [f.src, f.p1])).rows[0].quantity)).toBe(90);
    });
  }, 30_000);

  it('duplicate confirm is idempotent (returns existing, no extra movements)', async () => {
    await withRollback(async (c) => {
      const f = await setup(c);
      await actAs(c, f.salesman);
      const a = await call(c, f.manifest, 'accept_full', false, lines(f, 10, 10));
      const b = await call(c, f.manifest, 'accept_full', false, lines(f, 10, 10));
      await resetRole(c);
      expect(a).toBe(b);
      expect(await confCount(c, f.manifest)).toBe(1);
      expect(await moveCount(c, a)).toBe(2);
    });
  }, 30_000);

  it('full reject creates no ledger movements', async () => {
    await withRollback(async (c) => {
      const f = await setup(c);
      await actAs(c, f.salesman);
      const conf = await call(c, f.manifest, 'reject_full', true, lines(f, 10, 0));
      await resetRole(c);
      expect(await confCount(c, f.manifest)).toBe(1);
      expect(await moveCount(c, conf)).toBe(0);
    });
  }, 30_000);

  it('accepted_qty > loaded_qty is rejected (whole flow rolls back)', async () => {
    await withRollback(async (c) => {
      const f = await setup(c);
      await actAs(c, f.salesman);
      await c.query('savepoint sp');
      let raised = false;
      try { await call(c, f.manifest, 'accept_full', false, lines(f, 10, 12)); }
      catch { raised = true; await c.query('rollback to savepoint sp'); }
      await resetRole(c);
      expect(raised).toBe(true);
      expect(await confCount(c, f.manifest)).toBe(0); // nothing persisted
    });
  }, 30_000);

  it('an unauthorized salesman cannot confirm another salesman’s load', async () => {
    await withRollback(async (c) => {
      const f = await setup(c);
      const other = await mkUser(c, f.branch, 'salesman'); // not the assigned salesman, no stock.adjust
      await actAs(c, other);
      await c.query('savepoint sp');
      let raised = false;
      try { await call(c, f.manifest, 'accept_full', false, lines(f, 10, 10)); }
      catch { raised = true; await c.query('rollback to savepoint sp'); }
      await resetRole(c);
      expect(raised).toBe(true);
      expect(await confCount(c, f.manifest)).toBe(0);
    });
  }, 30_000);

  it('a mid-flow failure (no source warehouse) rolls the confirmation back entirely', async () => {
    await withRollback(async (c) => {
      const f = await setup(c, { withSource: false }); // manifest has no stock_request → posting fails
      await actAs(c, f.salesman);
      await c.query('savepoint sp');
      let raised = false;
      try { await call(c, f.manifest, 'accept_full', false, lines(f, 10, 10)); }
      catch { raised = true; await c.query('rollback to savepoint sp'); }
      await resetRole(c);
      expect(raised).toBe(true);
      expect(await confCount(c, f.manifest)).toBe(0);       // confirmation + lines rolled back
      const orphanLines = Number((await c.query('select count(*)::int n from erp_van_load_confirmation_lines').catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n);
      expect(orphanLines).toBe(0);
    });
  }, 30_000);
});
