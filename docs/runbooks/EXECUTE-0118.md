# Execute 0118 — operator-ready runbook (invoicing hotfix)

> **✅ EXECUTED & VALIDATED — 2026-06-04 (Option A backup gate met).** Migration
> `0118` was applied to production and validated; invoicing is RESTORED (see §6).
> Scope was `0118` ONLY — no `0109`, no full drift, no `db push`, no
> `migrate-production`. This runbook is retained as the execution record.

Target: Supabase project `nrvydmkxjnctdlaxdhur` (kako-fmcg, production).

---

## 0. Pre-flight — already verified (read-only, `2026-06-04`)

- `0118` NOT applied: `idempotency_key` columns absent, idem indexes absent.
- Dependencies present: `erp_invoices`, `erp_payments`, `erp_payment_method` enum, `erp_has_branch_access`.
- `erp_record_payment` = 1 overload (the pre-apply 5-arg).
- **Baseline:** invoices **123** · payments **47** · customers **52** · users **55** · last invoice **2026-06-01** · migration rows **100**.

---

## 1. Execution checklist (in order)

- [ ] **G1 — PITR confirmed ON** (operator, Supabase dashboard) + recovery timestamp recorded. ⛔ Hard gate.
- [ ] **G2 — Operator approval to apply** given.
- [ ] **A1 — Re-confirm un-applied** (read-only): idem columns still absent (guards against a concurrent change).
- [ ] **A2 — Apply `0118`** as a single recorded migration (exact SQL = the repo file; see §4).
- [ ] **A3 — Run validation** (§2). All must PASS.
- [ ] **A4 — Record outcome** (date/operator/PITR timestamp) and return PASS/FAIL.

---

## 2. Validation checklist (after apply)

**Schema (read-only SQL — I run via MCP):**
- [ ] `erp_invoices.idempotency_key` + `erp_payments.idempotency_key` exist (uuid).
- [ ] Unique partial indexes `uq_erp_invoices_idem`, `uq_erp_payments_idem` exist.
- [ ] `erp_record_payment` resolves with **6 args**; old 5-arg overload gone.

**Counts / integrity (read-only):**
- [ ] invoices ≥ 123, payments = 47, customers = 52 (no loss vs baseline).
- [ ] **No duplicate `idempotency_key`s**: the dup-check query returns 0 rows.

**Behaviour (operator, in the app — real business actions):**
- [ ] **Create an invoice** → succeeds (new row dated today).
- [ ] **Save a draft invoice** → succeeds.
- [ ] **Retry the save** (same idempotency_key) → **no duplicate** created.

**Advisors / auth (read-only):**
- [ ] `get_advisors` security — no new ERROR/WARN.
- [ ] `get_advisors` performance — no new missing-index findings.
- [ ] Auth fns intact: `erp_user_company_id`, `erp_is_platform_owner`, `erp_has_branch_access` present.

**No-regression (read-only + operator):**
- [ ] Inventory unaffected: `0118` touches only invoices/payments; inventory screen loads in app.
- [ ] Tenant isolation intact: RLS still ENABLED on `erp_invoices` + `erp_payments`; a scoped user sees only their own rows.

---

## 3. Rollback checklist (ONLY on FAIL, with approval)

- [ ] **Decision:** apply error or failed validation → choose mechanism.
- [ ] **Preferred — PITR restore** to the G1 timestamp (consistent).
- [ ] **Targeted reverse** (additive, executable via MCP):
  ```sql
  DROP INDEX IF EXISTS uq_erp_payments_idem;
  DROP INDEX IF EXISTS uq_erp_invoices_idem;
  ALTER TABLE erp_payments DROP COLUMN IF EXISTS idempotency_key;
  ALTER TABLE erp_invoices DROP COLUMN IF EXISTS idempotency_key;
  -- restore the 5-arg erp_record_payment body from migration 0007 if fully reverting
  DELETE FROM supabase_migrations.schema_migrations WHERE name = '0118_payment_invoice_idempotency';
  ```
- [ ] Re-verify health after rollback; record incident notes.

> ⚠️ Reverting re-breaks invoicing — only if the apply itself fails.

---

## 4. Exact commands (executed only after G1 + G2)

**A1 — re-confirm un-applied (read-only):**
```sql
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_name='erp_invoices' AND column_name='idempotency_key') AS inv_idem,
  (SELECT count(*) FROM pg_indexes WHERE indexname='uq_erp_invoices_idem') AS idx;
-- expect 0, 0
```

**A2 — apply (via Supabase MCP `apply_migration`):**
- `project_id = nrvydmkxjnctdlaxdhur`
- `name = 0118_payment_invoice_idempotency`
- `query = ` the exact contents of `supabase/migrations/0118_payment_invoice_idempotency.sql` (read fresh at execution; DDL is transactional, so the `DROP FUNCTION` → `CREATE` of `erp_record_payment` has no missing-function window).
- *(Equivalent manual form: `psql "$PRODUCTION_DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/migrations/0118_payment_invoice_idempotency.sql`.)*

**A3 — validation SQL (read-only):**
```sql
-- schema present
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_name IN ('erp_invoices','erp_payments') AND column_name='idempotency_key') AS idem_cols,        -- expect 2
  (SELECT count(*) FROM pg_indexes WHERE indexname IN ('uq_erp_invoices_idem','uq_erp_payments_idem')) AS idem_idx,                                            -- expect 2
  (SELECT count(*) FROM pg_proc WHERE proname='erp_record_payment' AND pronargs=6) AS rp6,                                                                      -- expect 1
  (SELECT count(*) FROM pg_proc WHERE proname='erp_record_payment' AND pronargs=5) AS rp5;                                                                      -- expect 0
-- counts unchanged
SELECT (SELECT count(*) FROM erp_invoices) AS invoices, (SELECT count(*) FROM erp_payments) AS payments, (SELECT count(*) FROM erp_customers) AS customers;
-- no duplicate idempotency keys
SELECT idempotency_key, count(*) FROM erp_invoices WHERE idempotency_key IS NOT NULL GROUP BY 1 HAVING count(*)>1;  -- expect 0 rows
-- RLS still enabled (tenant isolation)
SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('erp_invoices','erp_payments');  -- expect true, true
```
Plus `get_advisors` (security) and `get_advisors` (performance).

> Note: I will **not** insert test invoices into production. The "create / draft /
> retry" checks are performed by the operator through the app (real workflow);
> I confirm the result with the read-only counts + duplicate-key query above.

---

## 5. Time estimate & user impact

| Item | Estimate |
| --- | --- |
| A2 apply (`0118`) | **< 5 seconds** (2 nullable `ADD COLUMN`, 2 partial indexes over 123/47 rows, 1 fn replace; **no data backfill**) |
| A3 validation (SQL + operator app checks) | ~5–10 min |
| **Total** | **~10–15 min** |

**User impact:**
- **Invoicing RESTORED** — the headline fix. Positive.
- **No downtime.** All changes additive; locks are millisecond-scale on small tables. Maintenance window optional.
- **Zero data modification.** `0118` has no `UPDATE`/backfill — it only adds columns/indexes and replaces one function.
- **`erp_record_payment` change is backward-compatible** (new 6th arg defaults NULL); the `DROP`→`CREATE` is within one transaction (no missing-function window).
- **Payments become retry-safe** (no duplicate payments / double-decrement on retry) — a latent improvement, invisible to normal use.

---

## 6. Status — ✅ EXECUTED & VALIDATED (`2026-06-04`)

**Result: PASS.** Backup gate met via scheduled physical backup (latest
`04 Jun 2026 07:39 UTC`, restorable; PITR off — targeted-reverse is the rollback
path). `0118` applied to `nrvydmkxjnctdlaxdhur` as a recorded migration.

- A1 re-confirm un-applied: idem cols 0/0, indexes 0 ✅
- A2 apply `0118` (apply_migration): success ✅
- A3 validation: idem columns 2, unique partial indexes 2, `erp_record_payment` 6-arg=1 / 5-arg=0, counts unchanged (invoices 123, payments 47, customers 52), 0 duplicate keys, RLS on both tables, auth fns intact, migration recorded ✅
- Advisors: security 78 findings (all WARN, 0 ERROR); performance 0 ERROR; **no new finding** vs baseline — `erp_record_payment`'s 3 WARNs match its `0007` predecessor (SECURITY DEFINER pattern, DB-wide) ✅
- PostgREST schema cache reloaded; `erp_invoices.idempotency_key` API-visible ✅
- Rollback: not needed.

Final step (operator): create one real invoice in the app to confirm end-to-end.
