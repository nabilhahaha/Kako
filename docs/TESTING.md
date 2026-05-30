# Testing

## Unit tests (always run)

```bash
npm test
```

Pure functions only — no I/O. Covers sales-line math (`sales-calc`), permission
resolution (`permissions`), and small utils. These run in CI on every push/PR.

## Integration tests (gated on a database)

The suites under `src/test/integration/` exercise real Postgres behaviour:

- **`accounting.test.ts`** — `erp_post_revenue` posts a balanced double-entry
  (cash/bank debit vs. revenue credit, routed to the right chart codes), and the
  whole ledger never drifts out of balance (`sum(debit) = sum(credit)` per entry).
- **`rls.test.ts`** — multi-tenant Row-Level-Security: a user scoped to company A
  cannot read, update, or insert into company B; inserts are stamped with the
  caller's own company; a platform owner sees everything.

They only run when `TEST_DATABASE_URL` is set; otherwise they `skipIf`
themselves so `npm test`/CI stays green.

```bash
# Point at a DISPOSABLE database (a Supabase branch DB or a local stack), using
# the SESSION connection string (port 5432) with the owner/`postgres` role so the
# harness can `SET ROLE authenticated` to drive RLS.
export TEST_DATABASE_URL='postgresql://postgres:<password>@<host>:5432/postgres'
npm run test:db
```

Every test runs inside a transaction that is **always rolled back**
(`withRollback` in `src/test/db.ts`), so nothing is persisted — it is safe to
point at a shared branch DB, though a throwaway one is preferred.

> Do **not** point `TEST_DATABASE_URL` at the production database. Use a Supabase
> preview/branch database or a local `supabase start` stack.
