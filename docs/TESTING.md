# Testing

> **End-to-end (Playwright) tests** live under `e2e/` and are documented
> separately in [`docs/E2E.md`](./E2E.md) — run them with `npm run test:e2e`.
> They are isolated from the Vitest suites below (Vitest excludes `e2e/**`).

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
bash supabase/ci/setup-test-db.sh   # bootstrap + legacy stubs + every migration
npm run test:db
```

> `setup-test-db.sh` builds the schema from scratch: `ci/bootstrap.sql` (the
> Supabase environment — roles, `auth`, storage, realtime), `ci/legacy-base.sql`
> (stubs for the legacy "FieldSync" app tables that predate the migrations
> folder), then **every** migration `0001`→latest. Those two CI files exist only
> because the early migrations assume a base that was never captured as a
> migration; the erp_ system proper begins at `0005`.

Every test runs inside a transaction that is **always rolled back**
(`withRollback` in `src/test/db.ts`), so nothing is persisted — it is safe to
point at a shared branch DB, though a throwaway one is preferred.

> Do **not** point `TEST_DATABASE_URL` at the production database. Use a Supabase
> preview/branch database or a local `supabase start` stack.
