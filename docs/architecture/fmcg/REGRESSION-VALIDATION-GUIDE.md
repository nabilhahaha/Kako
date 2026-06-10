# VANTORA — Regression Validation Guide

How to re-validate FMCG correctness at any time. Two layers: the **automated
test suite** (CI + local) and the **executable reference-tenant regression**
(SQL). Both are idempotent and repeatable with no manual cleanup.

---

## 1. Automated test suite (primary regression gate)

```bash
# Unit (no DB):
npm run test:unit          # 1,280 tests

# Integration (DB-backed): bootstrap a disposable Postgres, then run.
export TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/postgres"
bash supabase/ci/setup-test-db.sh          # applies the full migration chain
npx vitest run src/test/integration        # 181 tests
```

Run on every change and in CI. Key FMCG regressions:

| Test | Guards |
|---|---|
| `src/test/integration/pilot-dry-run.test.ts` | Full operator day on the real RPCs |
| `src/test/integration/fmcg-pilot-simulation.test.ts` | ~1,000-txn invariants (stock, AR, allocation, isolation) |
| `src/test/integration/document-numbering-tenant-scope.test.ts` | **Tenant-scoped numbering (0268)** — two same-coded tenants coexist; intra-branch dupes rejected; all 12 scoped indexes present, no global ones remain |
| `src/test/integration/collection-settle.test.ts` | Collection allocation + balances |

**Green bar:** typecheck clean · 1,280 unit · 181 integration · build green.

## 2. Reference-tenant regression (executable SQL)

The reference tenant doubles as a living regression: it re-asserts the full
role-permission matrix and the end-to-end loop against the real RPCs.

```bash
export DB="postgresql://postgres:postgres@127.0.0.1:5432/postgres"

# Clean bootstrap → seed → validate. Repeatable with NO manual cleanup —
# the seed purges its own prior demo identities.
bash supabase/ci/setup-test-db.sh
psql "$DB" -f supabase/pilot/reference-company.sql              # provision (idempotent)
psql "$DB" -f supabase/pilot/reference-activity-and-validate.sql # activity + 109 role assertions
```

Expected on success:
```
all 109 role/permission assertions passed (allowed + blocked verified per role)
```

- **Re-runnable:** running `reference-activity-and-validate.sql` again skips the
  already-posted activity for the day and re-runs the **109 permission
  assertions** — use it as a standalone regression check any time.
- **Self-cleaning:** a fresh `bootstrap → seed → validate` cycle can be repeated
  back-to-back; each yields exactly 17 identities and identical results
  (verified across two cycles at certification).
- **Any failure aborts** with a precise message (e.g. the exact role/permission
  that diverged), and the transaction rolls back.

## 3. Pilot dry-run regression (executable SQL)

```bash
bash supabase/ci/setup-test-db.sh
psql "$DB" -f supabase/pilot/demo-distributor.sql      # single-distributor tenant (idempotent)
psql "$DB" -f supabase/pilot/run-pilot-dry-run.sql     # full day as real users
```
Expected: `════════ ALL CHECKS PASSED ════════` (numbering, allocation,
credit-note linkage, balance, van stock, reconciliation variance all asserted).

## 4. Multi-tenant numbering regression (what 0268 guarantees)

The reference and pilot tenants both own a branch coded `CAI`. Running both seeds
on one database and confirming both hold `INV-CAI-000001` proves the
tenant-scoped numbering holds (pre-0268 this collided):

```bash
psql "$DB" -c "SELECT c.name, i.invoice_number FROM erp_invoices i
  JOIN erp_branches b ON b.id=i.branch_id JOIN erp_companies c ON c.id=b.company_id
  WHERE i.invoice_number='INV-CAI-000001';"
# → two rows (one per tenant), no error.
```

## 5. When to run

| Trigger | Run |
|---|---|
| Every PR / CI | §1 automated suite |
| Touching RPCs, roles, or numbering | §1 + §2 + §4 |
| Before a pilot launch | §2 + §3 on the target (dedicated) project |
| Periodic platform regression | §1 + §2 + §3 + §4 |
