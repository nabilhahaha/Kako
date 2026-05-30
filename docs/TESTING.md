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
themselves so the plain `npm test` stays green.

### In CI

The `integration` job in `.github/workflows/ci.yml` spins up a throwaway
`postgres:16` service, builds the schema with `supabase/ci/setup-test-db.sh`
(a Supabase-compatible bootstrap + the erp_ migration chain), and runs
`npm run test:db` on every push/PR. This is what makes a database change
**verified before merge** rather than a risk taken against production.

### Locally

Against any disposable Postgres (a Supabase branch DB, a local `supabase start`
stack, or a bare `postgres:16`), using a connection string for the owner/
`postgres` role so the harness can `SET ROLE authenticated` to drive RLS:

```bash
export TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/postgres'
bash supabase/ci/setup-test-db.sh   # bootstrap + migrations (skip if the DB is already provisioned)
npm run test:db
```

> `setup-test-db.sh` applies the erp_ chain from migration 0005 onward. The
> 0001–0004 migrations patch the legacy inventory app, whose base tables predate
> the migrations folder and aren't needed by these tests.

Every test runs inside a transaction that is **always rolled back**
(`withRollback` in `src/test/db.ts`), so nothing is persisted — it is safe to
point at a shared branch DB, though a throwaway one is preferred.

> Do **not** point `TEST_DATABASE_URL` at the production database. Use a Supabase
> preview/branch database or a local `supabase start` stack.
