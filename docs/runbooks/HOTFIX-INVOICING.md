# Hotfix package — restore production invoicing (`0118` + `0109`)

> **Documentation only. Nothing here has been executed. No production migration
> has been run; no production data has been modified.**
> Target: Supabase `nrvydmkxjnctdlaxdhur` (**kako-fmcg**) — the live DB behind the
> Vercel `kako` app. Prepared `2026-06-04`.
> Companion to `docs/runbooks/MIGRATION-DRIFT-REMEDIATION.md` (full drift picture).

---

## 1. Scope — what this fixes and what it does not

**The incident:** invoice creation fails in production with *"Could not find the
'idempotency_key' column of 'erp_invoices' in the schema cache."* The
`createInvoice` server action (`src/app/(app)/sales/invoices/actions.ts`) always
writes `idempotency_key`; the live DB never applied migration `0118`, so the
column is absent and every save fails. (Last successful invoice: `2026-06-01`.)

**Two files, in this order:**

| Order | File | Why it's in the hotfix | Invoicing-critical? |
| --- | --- | --- | --- |
| 1 | `0118_payment_invoice_idempotency` | Adds `idempotency_key` + makes payments idempotent. **This is the fix.** | ✅ **Yes** |
| 2 | `0109_customer_approval` | Customer-approval governance + defines `erp_user_has_permission()`. Bundled per approved scope. | ❌ No (additive feature) |

> **Minimum to restore invoicing = `0118` alone.** `0109` is additive and
> approved for inclusion; it is **not** required to clear the invoice error
> (`erp_user_has_permission` has no app runtime call site — only a test
> references it; it is an internal SQL helper used by the workflow engine).
> If you want the smallest possible change, apply `0118` and defer `0109` to the
> full path — both are documented here.

**Out of scope (do NOT do):** `db push`, the `migrate-production` workflow, or
any of `0099`/`0100`/`0103`–`0108`/`0110`–`0143`. See the companion runbook §1
for why those tools are unsafe against the live DB.

---

## 2. Dependency verification (checked read-only against kako-fmcg, `2026-06-04`)

Because these two files are applied **ahead of** `0103`–`0108`, every object they
reference must already exist. It does:

**`0118` needs** — all ✅ present:
`erp_invoices`, `erp_payments`, `erp_payment_method` enum, `erp_has_branch_access()`.

**`0109` needs** — all ✅ present:
`erp_customers` (incl. `is_approved` column), `erp_companies`, `erp_user_branches`,
`erp_branches`, `erp_company_role_permissions`, `erp_role_permissions`, `erp_roles`,
`erp_workflow_steps`, `erp_workflow_definitions` (incl. the `customer_onboarding`
global template), and functions `erp_set_company_id`, `erp_is_platform_owner`,
`erp_user_company_id`, `erp_is_super_admin`, `erp_is_company_admin`.

**Neither file references any object created in `0099`/`0100`/`0103`–`0108`.**
Both are written with `IF NOT EXISTS` / `CREATE OR REPLACE` / `ON CONFLICT`, so a
single clean application is safe and re-runnable.

---

## 3. Backup steps (do BEFORE applying — both must succeed)

1. **Confirm Supabase PITR is ON** (dashboard → Project Settings → Database →
   Backups / PITR) and **note the current recovery timestamp** — this is the
   primary rollback (§5). 
2. **Take an on-demand portable dump:** Actions → *Database backup* → Run
   workflow (`.github/workflows/backup.yml` → `scripts/backup.sh`,
   `--no-owner --no-privileges`, custom format). Confirm the run is green and the
   artifact/S3 object exists. Label: `pre-hotfix-0118-0109-<UTC>`.
3. **Snapshot the baseline** (read-only) so §6 can prove no data loss:
   ```sql
   select
     (select count(*) from erp_invoices)  as invoices,   -- expect 123
     (select count(*) from erp_payments)  as payments,   -- expect 47
     (select count(*) from erp_customers) as customers,  -- expect 52
     (select max(created_at)::date from erp_invoices) as last_invoice; -- 2026-06-01
   ```

---

## 4. Apply steps (explicit; never `db push` / `migrate-production`)

Apply each file **verbatim, in its own transaction**, fail-fast. Recommended via
the Supabase SQL editor or `psql "$PROD_URL" -v ON_ERROR_STOP=1 -f <file>` against
a **one-off** connection (not the workflow).

1. `BEGIN;` → contents of `supabase/migrations/0118_payment_invoice_idempotency.sql` → `COMMIT;`
   *(Invoicing is restored at this point.)*
2. `BEGIN;` → contents of `supabase/migrations/0109_customer_approval.sql` → `COMMIT;`
3. **Record both** so a later full run skips them (pick the convention from the
   companion runbook §6 — `version` = numeric prefix is simplest):
   ```sql
   insert into supabase_migrations.schema_migrations (version, name) values
     ('0109','0109_customer_approval'),
     ('0118','0118_payment_invoice_idempotency')
   on conflict do nothing;
   ```

Wrapping each file in `BEGIN/COMMIT` means any mid-file error rolls that file
back atomically (including the brief `DROP FUNCTION`→`CREATE` of
`erp_record_payment`, so there is **no window** where the function is missing).

---

## 5. Rollback steps

**Preferred — PITR** to the §3.1 timestamp (covers everything, consistent).

**Targeted reverse** (both files are additive; safe to reverse by hand):
```sql
-- reverse 0109
drop function if exists erp_workflow_user_can_act(uuid, text, text);
drop function if exists erp_user_has_permission(uuid, text);
drop table if exists erp_customer_change_requests;     -- cascades its policy/trigger
alter table erp_customers drop column if exists approval_status;
alter table erp_customers drop column if exists rejection_reason;
alter table erp_companies drop column if exists customers_require_approval;
-- (the workflow_steps constraint widening + template retarget are harmless to leave;
--  to fully revert, restore prior approver_type/ref from git — or just use PITR)

-- reverse 0118
drop index if exists uq_erp_payments_idem;
drop index if exists uq_erp_invoices_idem;
alter table erp_payments  drop column if exists idempotency_key;
alter table erp_invoices  drop column if exists idempotency_key;
-- erp_record_payment: the 6-arg version is backward-compatible (6th arg DEFAULT
-- NULL), so leaving it is safe; to fully revert restore the 5-arg body from 0007.
```
Then delete the two `schema_migrations` rows added in §4.3.

> Reverting `0118` re-breaks invoicing, so only reverse if the apply itself
> failed. For a clean apply you should not need to roll back.

---

## 6. Validation checklist

**Schema**
- [ ] `erp_invoices.idempotency_key` and `erp_payments.idempotency_key` exist, type `uuid`.
- [ ] Partial unique indexes `uq_erp_invoices_idem`, `uq_erp_payments_idem` exist.
- [ ] `erp_record_payment` resolves with **6 args** (`p_idempotency_key uuid default null`); a 5-arg call still works (default).
- [ ] `erp_user_has_permission(uuid, text)` exists; `EXECUTE` revoked from `anon/authenticated/public`.
- [ ] `erp_customers.approval_status` / `rejection_reason`, `erp_companies.customers_require_approval`, table `erp_customer_change_requests` exist.

**Behavior (the actual incident)**
- [ ] **Create a real invoice from the app** → succeeds; a row with `created_at = <today>` appears (vs. the stuck `2026-06-01`).
- [ ] Re-submit the same `idempotency_key` → exactly one invoice/payment (race backstop holds).
- [ ] Record a payment with a repeated key → no double-decrement of customer balance.

**No-harm / data integrity**
- [ ] Row counts vs. §3.3 baseline unchanged: invoices ≥123, payments 47→unchanged (until new activity), customers 52.
- [ ] `select count(*) from erp_customers where approval_status <> 'approved'` → **0** (confirms the `0109` backfill changed nothing; `customers_require_approval` defaults `false`).
- [ ] App boots; Sales/Invoices, Customers, Payments render without 500s.
- [ ] `get_advisors` (security) — no new findings on the added objects.

**Tracking**
- [ ] The two `schema_migrations` rows exist; record date/operator/dump used.

---

## 7. Estimated execution time

| Phase | Time |
| --- | --- |
| Backup (PITR confirm + on-demand dump of a small DB) | ~2–3 min |
| Apply `0118` | < 2 s (2 nullable `ADD COLUMN`, 2 partial indexes over 123/47 rows, 1 fn replace) |
| Apply `0109` | < 2 s (3 `ADD COLUMN`, 1 table, 3 indexes, **0-row** backfill, 2 fns, 1 constraint, seeds) |
| Record `schema_migrations` | instant |
| Validation (§6) | ~5 min |
| **Total hands-on** | **~10 min** (actual DDL execution < 5 s) |

---

## 8. Expected user impact

- **Invoicing: RESTORED.** Before: every invoice save fails for all tenants.
  After: works. This is the point of the hotfix — net **positive**.
- **No downtime.** All DDL is additive; locks are `ACCESS EXCLUSIVE` only for the
  millisecond-scale `ADD COLUMN`/`CREATE INDEX` on tiny tables. A maintenance
  window is **optional**. At most a concurrent write could queue for a few ms.
- **`0109` changes no tenant behavior:** the backfill affects **0 of 52
  customers** (all are already `is_approved=true`), and customer-approval
  governance defaults **OFF** (`customers_require_approval=false`). No customer's
  sellability or workflow changes on apply.
- **`erp_record_payment` signature change is backward-compatible:** the new 6th
  arg defaults `NULL`, so existing 5-arg callers keep working; the app already
  passes the 6th. The `DROP`→`CREATE` happens inside one transaction → no
  missing-function window.
- **Payments become retry-safe:** a double-submit / network retry with the same
  key no longer creates duplicate payments or double-decrements balances —
  a latent correctness improvement, invisible to normal use.

---

## 9. Go/No-Go for this hotfix

**GO, with conditions:** take the §3 backup first; apply the two files
**explicitly** (§4), never via `db push`/`migrate-production`; run §6. `0118`
alone clears the incident; `0109` is approved, additive, and verified
zero-impact. **NO-GO** on touching any other migration or production data from a
tooling/automation path.

*End of hotfix package — documentation only; no migration executed, no
production data modified.*
