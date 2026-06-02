import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback } from '../db';

/**
 * Pricing engine P-a — erp_resolve_price() priority + effective dating
 * (migration 0106). Verifies the deterministic resolution order
 * (customer > segment > price list > base) and that a not-yet-effective rule is
 * ignored. Runs as the owner role (the resolver is SECURITY DEFINER and keys off
 * the customer's company). Gated on TEST_DATABASE_URL.
 */

async function price(c: Client, product: string, customer: string): Promise<{ price: number; source: string }> {
  const { rows } = await c.query('select price, source from erp_resolve_price($1,$2)', [product, customer]);
  return { price: Number(rows[0].price), source: rows[0].source };
}

describe.skipIf(!hasTestDb)('pricing · erp_resolve_price priority + effective dates', () => {
  it('customer > segment > price list > base, and ignores future-dated rules', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('PRICE') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id,code,name) values($1,'B','B') returning id", [company])).rows[0].id;
      const product = (await c.query(
        'insert into erp_products_catalog(company_id, code, name, sell_price) values ($1,$2,$2,100) returning id',
        [company, `P-${randomUUID()}`],
      )).rows[0].id;
      const seg = (await c.query("insert into erp_customer_lookups(company_id,kind,code,name) values($1,'segment','s','Seg') returning id", [company])).rows[0].id;
      const customer = (await c.query(
        'insert into erp_customers(company_id, code, name, branch_id, segment_id) values ($1,$2,$2,$3,$4) returning id',
        [company, 'C1', branch, seg],
      )).rows[0].id;

      // Price list (global default) item @ 90 — beats base 100.
      const pl = (await c.query("insert into erp_price_lists(name,is_default,is_active) values('PL',true,true) returning id")).rows[0].id;
      await c.query('insert into erp_price_list_items(price_list_id, product_id, unit_price) values ($1,$2,90)', [pl, product]);

      const rule = async (scope_type: string, scope_id: string | null, price_type: string, value: number, from?: string) =>
        (await c.query(
          `insert into erp_price_rules(company_id, product_id, scope_type, scope_id, price_type, value, valid_from)
           values ($1,$2,$3,$4,$5,$6,$7) returning id`,
          [company, product, scope_type, scope_id, price_type, value, from ?? null],
        )).rows[0].id;

      const segRule = await rule('segment', seg, 'percent_off', 10);   // 10% off list 90 = 81
      const custRule = await rule('customer', customer, 'fixed', 70);  // absolute 70

      // 1) customer beats segment.
      expect(await price(c, product, customer)).toEqual({ price: 70, source: 'customer' });

      // 2) drop the customer rule → segment applies (10% off the 90 list price).
      await c.query('update erp_price_rules set is_active=false where id=$1', [custRule]);
      expect(await price(c, product, customer)).toEqual({ price: 81, source: 'segment' });

      // 3) drop the segment rule → falls back to the price list.
      await c.query('update erp_price_rules set is_active=false where id=$1', [segRule]);
      expect(await price(c, product, customer)).toEqual({ price: 90, source: 'price_list' });

      // 4) a future-dated customer rule is ignored today → still the price list.
      await rule('customer', customer, 'fixed', 50, '2999-01-01');
      expect(await price(c, product, customer)).toEqual({ price: 90, source: 'price_list' });
    });
  }, 30_000);
});
