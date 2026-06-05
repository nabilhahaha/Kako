import { describe, it, expect } from 'vitest';
import { hasTestDb, connect } from '../db';

/**
 * Scalability regression guards (run against the live test DB built from
 * migrations). These catch the two classes of perf debt that silently creep in
 * as the schema grows:
 *   1. an unindexed foreign key (→ seq-scan joins + slow cascade DELETEs), and
 *   2. an RLS policy that calls auth.uid() UNWRAPPED (→ per-row re-evaluation,
 *      O(rows)), instead of `(select auth.uid())` which is evaluated once.
 * A new migration that regresses either will fail CI here. Gated on TEST_DATABASE_URL.
 */
describe.skipIf(!hasTestDb)('schema health · scalability invariants', () => {
  it('every foreign key has a covering index (first index column = FK column)', async () => {
    const c = await connect();
    try {
      const { rows } = await c.query(`
        WITH fk AS (
          SELECT c.conrelid::regclass::text AS tbl, c.conname,
                 a.attname AS col, c.conrelid, a.attnum
          FROM pg_constraint c
          JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
          WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace AND k.ord = 1
        ),
        covered AS (SELECT i.indrelid, (i.indkey::int2[])[0] AS first_col FROM pg_index i)
        SELECT fk.tbl, fk.col
        FROM fk
        WHERE fk.tbl LIKE 'erp_%'
          AND NOT EXISTS (SELECT 1 FROM covered cv WHERE cv.indrelid = fk.conrelid AND cv.first_col = fk.attnum)
        ORDER BY 1, 2`);
      const unindexed = rows.map((r) => `${r.tbl}.${r.col}`);
      expect(unindexed, `unindexed foreign keys (add a covering index):\n${unindexed.join('\n')}`).toEqual([]);
    } finally {
      await c.end().catch(() => {});
    }
  });

  it('no RLS policy calls auth.uid() unwrapped (must be (select auth.uid()))', async () => {
    const c = await connect();
    try {
      // Strip the wrapped form, then any remaining auth.uid() is a per-row call.
      const { rows } = await c.query(`
        SELECT tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename LIKE 'erp_%'
          AND regexp_replace(
                lower(coalesce(qual,'') || ' ' || coalesce(with_check,'')),
                '\\(\\s*select\\s+auth\\.uid\\(\\)[^)]*\\)', '', 'g'
              ) LIKE '%auth.uid()%'
        ORDER BY 1, 2`);
      const bare = rows.map((r) => `${r.tablename}.${r.policyname}`);
      expect(bare, `RLS policies with per-row auth.uid() (wrap in select):\n${bare.join('\n')}`).toEqual([]);
    } finally {
      await c.end().catch(() => {});
    }
  });
});
