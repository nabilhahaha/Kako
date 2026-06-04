# Production migration package — kako-fmcg drift remediation

> **Status (2026-06-04): partial — only the `0118` hotfix has been applied** (to
> restore invoicing; see `EXECUTE-0118.md`). **The full drift package in THIS
> document has NOT been executed.** Remaining open drift = `0099`, `0100`,
> `0103`–`0117`, `0119`–`0143` (42 migrations) — to be closed later **via staging
> dry-run first** (§6). Do not run it now.
> Target database: Supabase project **`nrvydmkxjnctdlaxdhur` (kako-fmcg)** — the
> live, data-bearing DB behind the Vercel **`kako`** app.
>
> Prepared `2026-06-04`. Read this top-to-bottom before touching production.

---

## 0. Why this package exists (the drift, in one paragraph)

The repo ships migrations `0001`→`0143` (140 files). The live DB has applied
everything **through `0098`, plus `0101` and `0102`** (the latter two out of
order). It is therefore **missing `0099`, `0100`, and `0103`–`0143` (43
migrations)**. The visible production symptom is that **invoice creation is
broken**: the app writes `erp_invoices.idempotency_key` (added in `0118`) and
that column does not exist, so every create fails with
*"Could not find the 'idempotency_key' column"* — which is why the most recent
invoice is dated `2026-06-01`.

### Confirmed drift sentinels (queried read-only against kako-fmcg)

| Migration | Object that should exist | Present? |
| --- | --- | --- |
| `0099` | `erp_companies.trial_ends_at` | ❌ |
| `0109` | `erp_user_has_permission()` fn + `erp_customers.approval_status` | ❌ |
| `0118` | `erp_invoices.idempotency_key`, `erp_payments.idempotency_key` | ❌ |
| `0128` | `erp_journey_plans` table | ❌ |
| `0137` | `erp_product_uoms` table | ❌ |

---

## 1. Three hazards that shape the whole plan

**Hazard A — `supabase db push` is NOT safe here.**
The live `supabase_migrations.schema_migrations.version` column uses full
timestamps (e.g. `20260602001511` for `0101`), while the repo files use `00XX_`
prefixes. The CLI matches on `version`, so it cannot reliably tell that `0101`
/`0102` are already applied and may try to **replay** them.

**Hazard A′ — the existing `migrate-production` GitHub workflow is ALSO unsafe
for this drift.** `.github/workflows/migrate-database.yml`'s manual
`migrate-production` job is a blind loop:
`for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -f "$f"; done`.
It consults **nothing** — it re-applies **all 143 files** from `0001`. The
workflow's own comment says the migrations "are not guaranteed idempotent;
re-running on a dirty DB may error" and it assumes a **reset** database. Against
the live DB (already at `0001`–`0098`/`0101`/`0102` with real data) it would
re-run `0101`'s bare `CREATE POLICY` and **halt mid-run** under `ON_ERROR_STOP`.
> **Do NOT trigger `migrate-production` for this remediation.** It is built for a
> fresh/reset target, not incremental drift closure. (CI confirms the full chain
> *does* apply cleanly to a **fresh** DB — see §7 evidence — which is why it is
> safe for a reset staging but not for production-as-is.)

**Hazard B — `0101` and `0102` are already applied and `0101` is NOT
re-runnable.**
`0101_regions_areas.sql` issues a bare `CREATE POLICY` inside a `DO/EXECUTE`
block (Postgres policies have no `IF NOT EXISTS`), so a replay errors with
*"policy already exists"*. (`0102`'s seed `INSERT`s are `ON CONFLICT DO NOTHING`,
so those are safe — but `0101` is the blocker.)

**Consequence:** apply the missing files **explicitly and individually, in
numeric order, and EXCLUDE `0101` and `0102`.** Do not run `supabase db push`
against production for this remediation.

**Good news (verified):** a destructive-DDL scan of `0099`–`0143` found **no
apply-time** `DROP TABLE` / `DROP COLUMN` / `TRUNCATE` / `DELETE FROM` /
`SET NOT NULL`. Every match is either a commented-out rollback note or a runtime
`DELETE` inside a function body (e.g. `0119` retention, `0132` day-close, `0138`
van reconciliation). **The package is additive and non-destructive at apply
time**, and the columns/indexes it adds are nullable / defaulted / partial, so no
table rewrites occur.

---

## 2. Backup procedure (run BEFORE either path)

Do all three. Do not proceed until step 2.1 and 2.2 both succeed.

**2.1 — Confirm/enable the primary safety net (Supabase PITR).**
Dashboard → Project Settings → Database → Backups / Point in Time Recovery.
Confirm PITR is **on** and note the current recovery timestamp. This is the
fast, consistent rollback path (see §3). Ref: `docs/BACKUPS.md`.

**2.2 — Take a fresh, portable pre-flight dump.**
Trigger the existing workflow on-demand: **Actions → Database backup → Run
workflow** (`.github/workflows/backup.yml`, uses `scripts/backup.sh`,
`--no-owner --no-privileges`, custom format). Confirm the run is green and the
artifact/S3 object exists. Label it mentally as
`pre-migration-0099-0143-<UTC>`.

**2.3 — Snapshot the migration state + key counts** (so rollback verification
has a baseline). Read-only:

```sql
-- migration history fingerprint
select count(*) as applied_count, max(version) as latest_version
from supabase_migrations.schema_migrations;

-- data baseline
select
  (select count(*) from erp_companies) as companies,
  (select count(*) from erp_invoices)  as invoices,
  (select count(*) from erp_payments)  as payments,
  (select count(*) from auth.users)    as auth_users,
  (select max(created_at)::date from erp_invoices) as last_invoice;
```

Record the output somewhere outside the DB.

---

## 3. Rollback procedure

Pick the lightest mechanism that covers the failure.

**3.1 — Preferred: Supabase PITR restore (covers any failure).**
Dashboard → Database → Point in Time Recovery → restore to the timestamp
captured in §2.1 (immediately before the run). This reverts schema **and** data
consistently. Use this if any migration leaves the DB in an unexpected state.

**3.2 — Targeted reverse (only for the hotfix path, §5).**
Both hotfix migrations are additive and ship documented reverse blocks. `0118`'s
is in-file (commented at the bottom). Reverse SQL, lowest-impact first:

```sql
-- reverse 0118 (idempotency)
drop index if exists uq_erp_payments_idem;
drop index if exists uq_erp_invoices_idem;
alter table erp_payments  drop column if exists idempotency_key;
alter table erp_invoices  drop column if exists idempotency_key;
drop function if exists erp_record_payment(uuid, numeric, erp_payment_method, text, date, uuid);
-- (then restore the 5-arg erp_record_payment from 0007 if you fully revert)

-- reverse 0109 (customer approval) — additive columns/tables
alter table erp_customers drop column if exists approval_status;
alter table erp_customers drop column if exists rejection_reason;
alter table erp_companies drop column if exists customers_require_approval;
drop table if exists erp_customer_change_requests;
drop function if exists erp_user_has_permission(uuid, text);
-- (0109 also touches the workflow engine; if reverting in anger prefer 3.1)
```

> ⚠️ Targeted reverse of the **full** path (`0099`–`0143`) by hand is error-prone
> (43 files, interleaved functions/policies). For the full path, **rollback =
> PITR (§3.1)**. Do not attempt a manual full reverse on production.

**3.3 — Last resort: `pg_dump` restore.**
If Supabase's own restore is unavailable, use `scripts/restore.sh --yes <dump>`
with `DATABASE_URL` pointed at production, after taking a fresh dump of the
current (broken) state first. See `docs/BACKUPS.md` §"Restoring production".

---

## 4. Estimated downtime

| Factor | Assessment |
| --- | --- |
| DDL type | All additive: `ADD COLUMN` (nullable/defaulted → no rewrite), `CREATE TABLE`, `CREATE INDEX` (partial, tiny), `CREATE OR REPLACE FUNCTION`, seed `INSERT … ON CONFLICT`. |
| Data volume | Tiny (123 invoices, 41 companies). Backfill `UPDATE`s (e.g. `0109` customer status) touch a handful of rows. |
| Locks | Brief `ACCESS EXCLUSIVE` per `CREATE INDEX` / `ALTER TABLE`, but milliseconds on tables this size. No `CREATE INDEX CONCURRENTLY` needed. |
| RLS/authz cutover | `0104`/`0105`/`0107`/`0108` change row visibility the instant they apply — a correctness event, not a downtime one. |

**Technical downtime: effectively zero (seconds of cumulative locking).**
**Recommended maintenance window: 10–15 min** as a safety envelope (so users
aren't mid-transaction during the authz/RLS cutover), not a technical necessity.
For the **hotfix path (§5)** a window is optional — it is two additive files.

---

## 5. Hotfix-only path — restore invoicing now (`0109` + `0118`)

> Use when invoicing must be restored before a full run can be scheduled.
> **Scope note:** the invoice incident itself is unblocked by **`0118` alone**
> (the `idempotency_key` column the app writes). `0109` is included per request;
> it adds the customer-approval feature and defines `erp_user_has_permission()`,
> which other surfaces call. Both are self-contained and additive.

**Dependency check (verified):**
- `0118` needs only `erp_payments`, `erp_invoices`, the `erp_payment_method`
  enum, and `erp_has_branch_access()` — **all present pre-`0102`**. No
  dependency on `0103`–`0117`.
- `0109` needs `erp_customers`, `erp_companies`, and the workflow engine
  (`0088`–`0090`, applied). Its header declares it additive + idempotent +
  "held from production"; it does **not** require `0103`–`0108`. ⚠️ It has not
  been integration-tested *in isolation* ahead of `0103`–`0108`, so prefer to
  validate on a branch (§7) first if time allows.

**Execution (explicit, ordered, do NOT use `db push`):**

1. Complete §2 (backup).
2. Apply `supabase/migrations/0118_*.sql` verbatim. *(Restores invoicing.)*
3. Apply `supabase/migrations/0109_customer_approval.sql` verbatim.
4. Record both in `schema_migrations` (so a later full run skips them):
   ```sql
   insert into supabase_migrations.schema_migrations (version, name)
   values ('0109','0109_customer_approval'), ('0118','0118_payment_invoice_idempotency')
   on conflict do nothing;
   ```
   *(Match the `version` convention the team settles on in §6 — see the tracking
   caveat there.)*
5. Run the hotfix slice of §7 (invoice-create smoke + idempotency).

**Rollback for this path:** §3.2 (targeted reverse) or §3.1 (PITR).

> ⚠️ Cherry-picking `0109`/`0118` deepens the out-of-order state (now applied:
> `…0098, 0101, 0102, 0109, 0118`). It is a stopgap — schedule the full path
> (§6) to close the remaining gap.

---

## 6. Full remediation path (`0099`, `0100`, `0103`–`0143`)

**Apply set (43 files), in numeric order, EXCLUDING `0101` and `0102`:**

```
0099 0100
0103 0104 0105 0106 0107 0108 0109 0110
0111 0112 0113 0114 0115 0116 0117 0118 0119 0120
0121 0122 0123 0124 0125 0126 0127 0128 0129 0130
0131 0132 0133 0134 0135 0136 0137 0138 0139 0140
0141 0142 0143
```

*(If the hotfix path already ran, also skip `0109` and `0118` — they are now
applied.)*

**Method — explicit per-file application, transaction-guarded, halt on first
error.** Recommended mechanics:

- Apply each file's SQL in order. Treat the batch as fail-fast: if any file
  errors, **stop**, do not continue, and go to rollback (§3.1).
- Prefer wrapping each file in its own transaction so a mid-file failure leaves
  that file fully rolled back (most files are already authored this way; a few
  define functions that must remain in one statement — apply as written).
- After each file (or at minimum after the batch), insert its
  `schema_migrations` row so the history reflects reality.

**Tracking caveat (decision required from the team):** the existing history mixes
full-timestamp `version`s with `00XX_` `name`s, so there is no clean convention
to inherit. Pick one before running:
- **(a)** record `version = '<NNNN>'` (the numeric prefix) + `name = '<full
  filename>'` for each applied file — simplest, makes `version` monotonic and
  human-readable; **or**
- **(b)** use `supabase migration repair` / the CLI's timestamping to align the
  whole table to one scheme.

Whichever is chosen, **after this run, `supabase db push` must correctly report
"no pending migrations"** — verify that as the closing step.

**Ordering note:** `0101`/`0102` were applied ahead of `0099`/`0100`. Re-check
that nothing in `0103`–`0143` assumes `0099`/`0100` ran *before* `0101`/`0102`.
Spot-checks found no such assumption (the `00XX` files are additive and guard
with `IF NOT EXISTS`), but confirm on a branch (§7) before production.

**Strongly recommended sequencing:**
1. §2 backup.
2. Dry-run the **entire** apply set on a Supabase **preview branch** (or a
   PITR-restored copy) — see §7. Fix any ordering/idempotency surprise there.
3. Schedule the 10–15 min window (§4).
4. Apply to production, fail-fast, then run the full §7 checklist.
5. Confirm `supabase db push` shows zero pending; confirm `get_advisors`
   (security + performance) is clean.

---

## 7. Validation checklist

Run the **hotfix slice** after §5; run **everything** after §6.

### Hotfix slice (invoicing)
- [ ] `erp_invoices.idempotency_key` and `erp_payments.idempotency_key` exist
      (`information_schema.columns`).
- [ ] Unique partial indexes `uq_erp_invoices_idem`, `uq_erp_payments_idem`
      exist.
- [ ] `erp_record_payment` now has the **6-arg** signature (with
      `p_idempotency_key`); the old 5-arg overload is gone (no PostgREST
      ambiguity).
- [ ] **Create a real invoice from the app** (the production repro) → succeeds;
      a new row with `created_at = 2026-06-04` appears.
- [ ] Submit the **same** `idempotency_key` twice → exactly one invoice/payment;
      balance decremented once (mirrors `src/test/integration/invoice-idempotency.test.ts`
      and `payment-idempotency.test.ts`).
- [ ] `erp_user_has_permission(company, 'customers.approve')` resolves for a
      permission holder (mirrors `customer-approval.test.ts`).

### Full path (additional)
- [ ] `supabase db push` (or chosen tracker) reports **no pending migrations**.
- [ ] Sentinels now present: `erp_companies.trial_ends_at` (0099),
      `erp_customers.approval_status` (0109), `erp_journey_plans` (0128),
      `erp_product_uoms` (0137).
- [ ] Row counts vs. the §2.3 baseline unchanged (no data loss): companies 41,
      invoices ≥123, payments unchanged, `auth.users` 55.
- [ ] **RLS/authz smoke** (because `0104`/`0105`/`0107`/`0108` change scope):
      log in as a hierarchy-scoped user and confirm they see exactly their
      region/area customers and transactions — not more, not fewer.
- [ ] App boots; key surfaces render without 500s: Sales/Invoices, Customers,
      Pricing, Journey Plans, FMCG settings.
- [ ] `get_advisors` (security) — no new ERROR/WARN (e.g. tables without RLS,
      `SECURITY DEFINER` search_path).
- [ ] `get_advisors` (performance) — no missing-index regressions on the new
      tables.
- [ ] App test suite green against the migrated branch (`npm test` /
      integration tests under `src/test/integration/`).
- [ ] Tag/record the completion (date, who, dump used) per `docs/BACKUPS.md`
      convention.

---

## 8. One-glance decision summary

| | Hotfix (§5) | Full (§6) |
| --- | --- | --- |
| Files | `0109`, `0118` (2) | `0099`,`0100`,`0103`–`0143` (43, **excl. 0101/0102**) |
| Restores invoicing | ✅ (via `0118`) | ✅ |
| Closes all drift | ❌ | ✅ |
| Downtime | ~0 (window optional) | ~0 technical; 10–15 min window advised |
| Rollback | targeted reverse (§3.2) or PITR | **PITR (§3.1)** |
| Method | explicit apply, **never `db push`**, **never `migrate-production`** | same |
| Pre-req | §2 backup | §2 backup **+** branch dry-run (§7) |

---

## 9. Pre-flight gate evidence (verified `2026-06-04`)

Run on `claude/fmcg-bug-hunt` (Wave 1 + bug-hunt hotfix), reproducing the CI jobs
locally and on a throwaway Postgres 16:

| Gate | Result |
| --- | --- |
| `tsc --noEmit` (typecheck) | ✅ 0 errors |
| `vitest run` (unit/i18n/logic) | ✅ 453 passed, 22 skipped (no-DB) |
| `setup-test-db.sh` — full chain `0001`→`0143` on a **fresh** DB | ✅ clean apply (benign skip NOTICEs only) |
| `vitest run src/test/integration` (DB) | ✅ **22 passed** (incl. invoice/payment idempotency, RLS) |
| `next build` | ✅ success |
| GitHub Actions: `CI`, `E2E` | ✅ green on the latest commit |

> The fresh-DB full-chain apply proves the migration set is **internally
> consistent and ordering-clean** — directly de-risking the §6 full path **when
> run against a reset staging/branch**. It does *not* test replay onto the live
> partially-migrated DB; that is exactly why §6 applies only the missing files.

## 10. Final recommendation — GO / NO-GO

| Decision | Verdict |
| --- | --- |
| **Ship the code (PRs #98 Wave 1, #99 bug-hunt) once review-approved** | **GO** — additive, all gates green, no production DB dependency to merge. |
| **Restore invoicing on production via the hotfix path (§5: `0118`, then `0109`)** | **GO, with conditions** — take the §2 backup first; apply the two files **explicitly** (never `db push`/`migrate-production`); run the §7 hotfix checklist. `0118` alone clears the live invoice error. |
| **Full drift closure (§6: `0099`,`0100`,`0103`–`0143`)** | **CONDITIONAL GO** — only after (1) a branch/PITR-copy dry-run of the exact missing-file set, (2) the team picks a `schema_migrations` tracking convention (§6 caveat), and (3) a 10–15 min window for the RLS/authz cutover. |
| **Using the `migrate-production` workflow as-is, or `supabase db push`, against the live DB** | **NO-GO** — both re-apply already-applied, non-idempotent migrations and will halt mid-run (§1 Hazard A/A′). |
| **Modifying production data / executing any migration from this session** | **NO-GO / out of scope** — this package is documentation only. |

**Bottom line:** the application changes are green and safe to merge on review.
Production invoicing can be restored low-risk via the explicit two-file hotfix
after a backup. Full drift closure is ready to execute but is gated on a staging
dry-run + a tracking-convention decision — not a blocker for the hotfix.

*End of package — documentation only; no migrations were applied and no
production data was modified.*
