# Kako — Executive Summary (production readiness & invoicing outage)

> **Documentation only.** No production change, no migration, no new feature is
> introduced by this document. Prepared `2026-06-04`. Audience: decision-makers.

> **🟢 STATUS UPDATE — 2026-06-04 (post-hotfix):** Migration **`0118` was applied to
> production and validated**, and **production invoicing is RESTORED** (a real
> invoice was created successfully; invoices 123 → 124). **`0109` was NOT applied.
> The full 43-migration drift package was NOT applied** — the remaining drift
> (`0099`,`0100`,`0103`–`0117`,`0119`–`0143`) is still open and must be closed
> later via staging. **No AI was enabled** (`COPILOT_AI_ENABLED` stays OFF). This
> banner supersedes any "broken / pending / not yet applied" wording below, which
> is retained as the incident record. Execution record: `runbooks/EXECUTE-0118.md`.

---

## 1. Current platform health

| Layer | State |
| --- | --- |
| **Application code** | ✅ Healthy. All gates green — `tsc` 0 errors, `vitest` 453 passed/22 skipped, **22/22** DB-integration tests, `next build` ✅, GitHub `CI`/`E2E` ✅. |
| **Open PRs** | ✅ #98 (Wave 1), #99 (Bug-Hunt + remediation package), #100 (AI strategy, parked) — all CI-green. #98/#99 review-ready; #100 draft. |
| **Production database** (`kako-fmcg`) | ⚠️ **Drifted.** Real data intact (52 customers, 123 invoices, 47 payments, 55 users) but missing migrations `0099`, `0100`, `0103`–`0143`. |
| **Production app behaviour** | 🔴 **Invoicing broken since `2026-06-01`** (see §3). Other surfaces operational. |

**One-line verdict:** the codebase is in good shape; the problem is a
**database/code version mismatch in production**, not a software defect.

---

## 2. Open production issues

| # | Severity | Issue | Status |
| --- | --- | --- | --- |
| 1 | ✅ Resolved | Invoice creation fails for all tenants (missing `idempotency_key` column) | **`0118` applied + validated 2026-06-04; invoicing restored** (123→124) |
| 2 | 🟠 High | Schema drift: 43 migrations unapplied in production | Remediation package ready; staged plan documented |
| 3 | 🟢 Resolved (in code) | Mobile "Inventory" tab 404 | Fixed in PR #99; ships on deploy |

---

## 3. Root cause of the invoicing outage

- The **deployed app** writes `erp_invoices.idempotency_key` on every invoice
  save (`src/app/(app)/sales/invoices/actions.ts`). That column was introduced by
  migration **`0118`**.
- The **production database never applied `0118`** (it is current only through
  ~`0102`). PostgREST therefore returns *"Could not find the 'idempotency_key'
  column of 'erp_invoices' in the schema cache,"* and **every invoice creation
  fails** — last successful invoice `2026-06-01`.
- **Root cause = environment/schema drift:** application code that depends on a
  migration was deployed ahead of (or without) that migration reaching
  production. The repo and migration `0118` are correct; the production DB is
  behind. *(Systemic fix in §11.)*

---

## 4. Inventory fix summary (PR #99)

- **Symptom:** tapping the mobile bottom-nav **"Inventory"** tab returned a 404.
- **Cause:** the tab linked to `/inventory/products`, which does not exist (stock
  lives at `/inventory`; the catalog is `/products`).
- **Fix:** corrected the href to `/inventory`; extracted the tab list into a pure
  module (`bottom-nav-tabs.ts`); added `bottom-nav.test.ts` asserting **every**
  bottom-nav target resolves to a real App-Router page — a dead-link regression
  guard so this class of bug can't recur silently.

---

## 5. Wave 1 deliverables (PR #98 — FMCG Value Acceleration)

Additive, tenant-safe, reuse-first. Migrations `0137`–`0143`:
- **Multi-UOM + price book** (`erp_product_uoms`, `erp_prices`, resolve-price with
  customer › channel › generic, qty tiers, effective windows, sell-price fallback).
- **Van reconciliation** (variance vs. live van stock; threshold approval).
- **Targets & achievement** (level/period/metric; commission extension point).
- **Return-reason analytics** (catalog + returns-by-reason).
- **Credit-limit request/approve** (reuses existing workflow engine).
- **Product search + sales/coverage summaries** (tenant-scoped, paginated).
- **12 new granular permissions** + an admin/manager `'*'` DB-consistency fix.
- **App layer:** permission-gated server actions, searchable comboboxes, 7 new
  screens, bilingual i18n, Copilot help. Gates green.

---

## 6. Bug-Hunt deliverables (PR #99)

- **Inventory 404 fix** + dead-link regression test (§4).
- **Invoice idempotency regression guard** — a DB test that fails loudly in a
  drifted environment instead of surfacing an opaque PostgREST error.
- **CI test fix** — savepoint around an expected duplicate-key insert (DB-integration job).
- **Read-only drift investigation** of the live DB (no data touched).
- **Production remediation package** (documentation): `runbooks/README.md` (index),
  `HOTFIX-INVOICING.md`, `MIGRATION-DRIFT-REMEDIATION.md`.

---

## 7. Production remediation plan

**Priority #1 — restore invoicing (hotfix):** apply **`0118`** explicitly (one
file; optionally `0109` per the approved bundle). Additive, ~10 min, zero
behaviour change. Restores invoicing immediately.

**Phase 2 — full drift closure (later):** apply the 43 missing files
(`0099`,`0100`,`0103`–`0143`, **excluding** already-applied `0101`/`0102`),
explicitly and in order, **after** a staging/PITR-copy dry-run and a
`schema_migrations` tracking-convention decision.

**Hard NO-GO:** `supabase db push` and the repo's `migrate-production` workflow —
both blindly replay already-applied, non-idempotent migrations and halt mid-run.

Full detail: `docs/runbooks/`.

---

## 8. Backup procedure

1. Confirm **Supabase PITR is ON**; note the current recovery timestamp.
2. Take an on-demand **`scripts/backup.sh`** dump (Actions → Database backup);
   confirm green and stored.
3. Record a **baseline snapshot** (invoice/payment/customer counts) for
   post-change verification.

(Reference: `docs/BACKUPS.md`.)

---

## 9. Rollback procedure

- **Preferred — PITR** restore to the pre-change timestamp (consistent, covers
  schema + data).
- **Targeted reverse** — both hotfix files are additive and ship documented
  reverse SQL (drop the added columns/indexes/functions).
- **Last resort** — `scripts/restore.sh --yes <dump>` after dumping the current state.

(Reference: `docs/runbooks/HOTFIX-INVOICING.md` §5.)

---

## 10. Go / No-Go decisions

| Decision | Verdict |
| --- | --- |
| Merge Wave 1 (#98) & Bug-Hunt (#99) on review | **GO** — additive, all gates green |
| Restore invoicing via explicit `0118`(+`0109`) after backup | **GO, with conditions** — backup first; explicit apply only |
| Full drift closure (`0099`–`0143`) | **CONDITIONAL GO** — staging dry-run + tracking-convention decision + maintenance window |
| `migrate-production` workflow / `db push` on live DB | **NO-GO** |
| Execute any migration or modify prod data from automation/this session | **NO-GO / out of scope** |
| Start AI / Wave 2 / new modules | **NO-GO (frozen)** |

---

## 11. Recommended next priorities (after invoicing is restored)

1. **Stabilise & verify** production post-hotfix (real invoice create, idempotent
   retry, advisors clean).
2. **Close the full drift** via the staged plan (staging dry-run first).
3. **Merge** #98 and #99.
4. **Fix the systemic cause** so this can't recur:
   - Make the `migrate-production` workflow **drift-safe** (apply only pending,
     idempotent migrations; reconcile the `schema_migrations` version scheme).
   - Add a **deploy gate** so application code that needs a migration cannot ship
     ahead of that migration reaching production.
5. **Then** revisit the **Copilot AI enhancement track** (PR #100) — only once
   production is stable.

---

*Prepared as a documentation + decision artefact. No production changes, no
migrations, and no new features were introduced. Status: monitoring only.*
