import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * 0144 — Copilot AI audit logging + tenant isolation.
 *
 * Proves, against a properly-migrated DB, that:
 *  (a) erp_log_copilot_ai accepts the new 'ai_ask' type and writes a row scoped
 *      to the acting user's company (provenance columns populated), and
 *  (b) the company-scoped RLS read prevents one company's admin from seeing
 *      another company's copilot queries (no cross-tenant access).
 */

async function mkUser(c: Client): Promise<string> {
  const id = randomUUID();
  await c.query('insert into auth.users(id, email) values ($1,$2)', [id, `u+${id}@test.local`]);
  return id;
}

/** Seed a company with one admin user; return ids. */
async function seedCompanyAdmin(c: Client, name: string) {
  const company = (await c.query('insert into erp_companies(name) values ($1) returning id', [name])).rows[0].id;
  const branch = (await c.query("insert into erp_branches(company_id,code,name) values ($1,'HQ','HQ') returning id", [company])).rows[0].id;
  const user = await mkUser(c);
  await c.query('insert into erp_user_branches(user_id,branch_id,role,is_default) values ($1,$2,$3,true)', [user, branch, 'admin']);
  return { company, branch, user };
}

describe.skipIf(!hasTestDb)('copilot AI (0144)', () => {
  it('erp_log_copilot_ai logs an ai_ask row scoped to the acting company', async () => {
    await withRollback(async (c) => {
      const a = await seedCompanyAdmin(c, 'AI-A');

      await actAs(c, a.user);
      const id = (await c.query(
        "select erp_log_copilot_ai($1,$2,$3,$4,$5) as id",
        ['customer.create', 'en', 'deterministic', false, true],
      )).rows[0].id;
      expect(id).toBeTruthy();

      const row = (await c.query(
        'select company_id, query_type, action_key, ai_provider, ai_fallback, blocked from erp_copilot_queries where id=$1',
        [id],
      )).rows[0];
      await resetRole(c);

      expect(row.company_id).toBe(a.company);
      expect(row.query_type).toBe('ai_ask');
      expect(row.action_key).toBe('customer.create');
      expect(row.ai_provider).toBe('deterministic');
      expect(row.ai_fallback).toBe(false);
      expect(row.blocked).toBe(true);
    });
  }, 30_000);

  it('a company admin cannot read another company\'s copilot queries (no cross-tenant)', async () => {
    await withRollback(async (c) => {
      const a = await seedCompanyAdmin(c, 'AI-A2');
      const b = await seedCompanyAdmin(c, 'AI-B2');

      // Company B logs an AI query (as B's user).
      await actAs(c, b.user);
      await c.query("select erp_log_copilot_ai($1,$2,$3,$4,$5)", ['day.close', 'en', 'deterministic', false, null]);
      await resetRole(c);

      // Company A logs its own, then reads — RLS must show ONLY company A's rows.
      await actAs(c, a.user);
      await c.query("select erp_log_copilot_ai($1,$2,$3,$4,$5)", ['customer.create', 'en', 'deterministic', false, false]);
      const rows = (await c.query('select company_id from erp_copilot_queries')).rows as { company_id: string }[];
      await resetRole(c);

      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.company_id === a.company)).toBe(true);
      expect(rows.some((r) => r.company_id === b.company)).toBe(false);
    });
  }, 30_000);
});
