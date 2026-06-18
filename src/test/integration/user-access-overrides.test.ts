import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hasTestDb, withRollback } from '../db';

/**
 * User Access Overrides (0346) — extends the existing access-grant engine with a
 * 'override' kind (permanent grant/revoke), a platform-owner delegability
 * allowlist + immutable deny-list (DB belt), and admin-gated writes. Verifies:
 *   1. backward compatibility — legacy temporary grants are unchanged;
 *   2. the override resolver query selects active overrides;
 *   3. erp_is_delegable_permission enforces operational-only at the DB layer.
 * Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('user access overrides · schema + resolution', () => {
  it('backward compat: legacy temporary grant still resolves exactly as before', async () => {
    await withRollback(async (c) => {
      const co = (await c.query('insert into erp_companies(name) values ($1) returning id', ['UaoCo'])).rows[0].id;
      const user = randomUUID();
      // Legacy insert shape (no effect/kind columns supplied) → defaults apply.
      await c.query(
        `insert into erp_temporary_access_grants(company_id,user_id,grant_key,effective_from,effective_to)
         values ($1,$2,'reports.view', now() - interval '1 day', now() + interval '7 days')`,
        [co, user],
      );
      const { rows } = await c.query(
        `select grant_key, effect, kind from erp_temporary_access_grants
          where company_id=$1 and user_id=$2 and expired_at is null
            and effective_from <= now() and effective_to >= now()`,
        [co, user],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].grant_key).toBe('reports.view');
      expect(rows[0].effect).toBe('grant');     // defaulted
      expect(rows[0].kind).toBe('temporary');   // defaulted → legacy behavior
    });
  });

  it('override rows: permanent (null window) grant + revoke are selected by the resolver query', async () => {
    await withRollback(async (c) => {
      const co = (await c.query('insert into erp_companies(name) values ($1) returning id', ['UaoCo2'])).rows[0].id;
      const user = randomUUID();
      await c.query(
        `insert into erp_temporary_access_grants(company_id,user_id,grant_key,kind,effect,reason,effective_from,effective_to)
         values ($1,$2,'customer.request','override','grant','pilot',NULL,NULL),
                ($1,$2,'returns.create','override','revoke','sod',NULL,NULL)`,
        [co, user],
      );
      const { rows } = await c.query(
        `select grant_key, effect from erp_temporary_access_grants
          where company_id=$1 and user_id=$2 and kind='override' and expired_at is null
            and (effective_from is null or effective_from <= now())
            and (effective_to   is null or effective_to   >= now())
          order by grant_key`,
        [co, user],
      );
      expect(rows.map((r) => `${r.grant_key}:${r.effect}`)).toEqual([
        'customer.request:grant', 'returns.create:revoke',
      ]);
    });
  });

  it('override path requires a non-empty reason (CHECK)', async () => {
    await withRollback(async (c) => {
      const co = (await c.query('insert into erp_companies(name) values ($1) returning id', ['UaoCo3'])).rows[0].id;
      const user = randomUUID();
      await expect(
        c.query(
          `insert into erp_temporary_access_grants(company_id,user_id,grant_key,kind,effect)
           values ($1,$2,'customer.request','override','grant')`,
          [co, user],
        ),
      ).rejects.toThrow();
    });
  });

  it('erp_is_delegable_permission: operational allowed, forbidden classes rejected', async () => {
    await withRollback(async (c) => {
      const co = (await c.query('insert into erp_companies(name) values ($1) returning id', ['UaoCo4'])).rows[0].id;
      const ok = await c.query(`select erp_is_delegable_permission('customer.request',$1) as d`, [co]);
      expect(ok.rows[0].d).toBe(true);
      for (const p of ['accounting.post', 'treasury.transfer', 'platform.manage', 'super.admin', 'integrations.manage', 'settings.users', 'returns.approve']) {
        const r = await c.query(`select erp_is_delegable_permission($1,$2) as d`, [p, co]);
        expect(r.rows[0].d).toBe(false);
      }
    });
  });

  it('operational allowlist is seeded (global rows)', async () => {
    await withRollback(async (c) => {
      const { rows } = await c.query(
        `select permission from erp_delegable_permissions where company_id is null and enabled order by permission`,
      );
      const seeded = rows.map((r) => r.permission);
      for (const p of ['cash.handover.request', 'customer.request', 'day.reopen.request', 'returns.create', 'sales.discount', 'stock_request.create']) {
        expect(seeded).toContain(p);
      }
    });
  });
});
