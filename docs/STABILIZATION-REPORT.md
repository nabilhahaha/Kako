# Kako — Stabilization Report (post-invoicing-recovery)

> **Documentation only.** Production was changed exactly once in this effort —
> the `0118` invoicing hotfix (applied + validated). Nothing else touched
> production. No `0109`, no full drift, no AI enabled, no Wave 2. Prepared
> `2026-06-04`. Authoritative post-hotfix status doc.

---

## 1. Current production status — 🟢 STABLE / invoicing RESTORED

| | |
| --- | --- |
| Invoicing | ✅ **Working** — real invoice created `2026-06-04 11:59 UTC` (123 → 124). |
| `0118` | ✅ Applied + recorded in `schema_migrations`; PostgREST cache reloaded. |
| Data | ✅ Unchanged by the migration (additive, zero backfill). |
| Residual drift | ⚠️ Open — `0099`,`0100`,`0103`–`0117`,`0119`–`0143` (42 migrations) NOT applied. |
| AI | ⛔ OFF (`COPILOT_AI_ENABLED` unset). |
| PITR | ⚠️ Not enabled (scheduled physical backups ARE on; latest `07:39 UTC`). |

**Production health score: 92 / 100** (was 72). Held below ~95 by the residual
drift and PITR being off.

---

## 2. What changed vs. what did NOT

**Changed (production):**
- `erp_invoices.idempotency_key` + `erp_payments.idempotency_key` (nullable uuid) added.
- Unique partial indexes `uq_erp_invoices_idem`, `uq_erp_payments_idem`.
- `erp_record_payment` replaced with the backward-compatible 6-arg idempotent version.
- One `schema_migrations` row recorded (`0118_payment_invoice_idempotency`).

**Did NOT change:**
- No `0109`. No `0099`/`0100`/`0103`–`0117`/`0119`–`0143`. No `db push`, no `migrate-production`.
- No tenant data modified (counts unchanged at apply time; new invoice is normal app activity).
- No RLS/authz policy changes. No AI enablement. No new modules. No Wave 2.

---

## 3. Validation evidence (read-only, post-hotfix)

| Check | Result |
| --- | --- |
| `0118` recorded | ✅ 1 |
| idempotency_key cols (invoices/payments, uuid) | ✅ 1 / 1 |
| Unique partial indexes (and unique) | ✅ 2 / 2 |
| `erp_record_payment` 6-arg / 5-arg | ✅ 1 / 0 |
| Invoice creation | ✅ 123 → **124** (today, 11:59 UTC) |
| Draft save | ✅ drafts present, path functional |
| Duplicate invoice / payment keys | ✅ 0 / 0 |
| RLS on invoices + payments | ✅ true |
| Auth fns intact | ✅ `erp_user_company_id`, `erp_is_platform_owner`, `erp_has_branch_access` |
| Inventory unaffected | ✅ no `0118` change to inventory |
| Advisors | ✅ 0 ERROR; no new finding (the 3 on `erp_record_payment` match its `0007` predecessor) |

---

## 4. Open risks

| # | Risk | Sev | Mitigation |
| --- | --- | --- | --- |
| R1 | Residual drift (42 migrations) → future "column missing" style breakage | High | Close via staging dry-run (§7 plan); do NOT run now. |
| R2 | PITR off → only coarse physical-backup recovery | Med | Enable PITR before the full drift closure; targeted-reverse covers `0118`. |
| R3 | `migrate-production` workflow still unsafe (blind replay) | Med | Rewrite to apply-pending-only (§6) before any further migration. |
| R4 | Stacked PRs on feature branches, not `main` | Med | Defined merge order (§8); resolve base before merge. |
| R5 | No deploy gate → code can still ship ahead of a migration | Med | Build the gate (§6) — root-cause fix. |
| R6 | AI accidentally enabled | Low | Flag OFF by default; no LLM wired; fallback safe. |

---

## 5. AI status (Copilot AI V1)

- **Status:** V1 shipped on PR #101 (draft) — deterministic Ask-Copilot, flag-gated, **OFF by default** (`COPILOT_AI_ENABLED`). No LLM/paid dependency.
- **Safe to test later (in staging, flag ON):** the deterministic Ask screen; intent accuracy on the `erp_copilot_queries` log; registering a free-tier LLM provider behind the flag (fallback to deterministic guaranteed).
- **Must wait until production is stable:** any production flag-ON; any LLM provider in production; the `0144` AI-audit migration (do not apply to production yet).
- **AI Phase 2 plan (after stabilization):** (1) staging eval with a free-tier LLM provider; (2) Arabic/English accuracy + latency measurement; (3) gradual per-env / per-company enablement; (4) only then consider production. Details: `AI-ARCHITECTURE.md`, `AI-STRATEGY.md`.

---

## 6. Prevent-recurrence — technical plan (NOT implemented; no production change)

Concrete, reviewable plan to stop "code shipped ahead of its migration" from recurring.

1. **Migration drift detection (CI + scheduled):**
   - A job that compares repo `supabase/migrations/*` against `schema_migrations` on each target env and **fails / alerts** when the env is behind. Reconcile the version-scheme mismatch first (numeric prefix vs timestamp).
2. **Deploy gate (blocks deploy when DB is behind code):**
   - Pre-deploy check: scan the build's required DB objects (or the highest migration the code depends on) vs. the target DB; **block the production deploy** if any required migration is unapplied. Wire into the Vercel/CI promotion step.
3. **Staging dry-run before production:**
   - Mandatory: apply pending migrations to a **reset staging / PITR-restored copy**, run `test:db` + smoke, before any production apply. (CI already proves the full chain applies clean to a fresh DB — extend to staging.)
4. **Backup/PITR requirement before production migrations:**
   - Make "PITR ON (or a fresh verified dump) within N hours" a **hard pre-flight gate** in the migration workflow; refuse to proceed otherwise.
5. **Schema-cache reload after migrations:**
   - Automatically issue `NOTIFY pgrst, 'reload schema'` (or the Supabase equivalent) as the final migration step so the API sees new columns immediately.
6. **Post-deploy smoke test for invoice creation:**
   - An automated post-deploy probe that creates + rolls back (or uses a synthetic tenant) an invoice and asserts success, failing the deploy if invoicing is broken.
7. **Rewrite `migrate-production`** to apply **only pending, idempotent** migrations (no blind full replay) and to record them under one consistent `schema_migrations` convention.

> Implementation is deferred (no production change now). This is the design for
> the post-stabilization "harden the pipeline" workstream.

---

## 7. Drift closure (later, NOT now)

The 42 remaining migrations stay open. Close them **only** via:
staging/PITR-copy dry-run → ordered explicit apply (excl. already-applied
`0101`/`0102`/`0118`) → verify zero pending → validate. Per
`runbooks/MIGRATION-DRIFT-REMEDIATION.md`. **Enable PITR first.**

---

## 8. Go / No-Go matrix

| Decision | Verdict |
| --- | --- |
| Keep production running on the `0118` fix | **GO** — validated, stable. |
| Merge #98 + #99 after review | **GO** — green, clean; resolve base path first (§ merge order). |
| Keep #100 / #101 parked (draft) | **GO** — AI track, flag-OFF. |
| Enable `COPILOT_AI_ENABLED` in production | **NO-GO** — wait for stability + staging eval. |
| Apply `0109` / full drift / `migrate-production` now | **NO-GO** — staging dry-run + PITR first. |
| Touch production again this sprint | **NO-GO** — stabilization is complete. |

**Merge order (after approval):** resolve base → **#98 (Wave 1)** → **#99
(bug-hunt + docs)**; #100/#101 remain parked.

---

## 9. Day-1 monitoring checklist

- [ ] Invoice + payment creation success rate (watch the recovered path).
- [ ] Error rate / latency nominal; no spike in failed RPCs (Vercel runtime logs).
- [ ] No `idempotency`/`schema cache` errors in logs.
- [ ] `get_advisors` (security + performance) — no new ERROR.
- [ ] Daily backup workflow green (~02:00 UTC); **enable PITR**.
- [ ] Confusion Analytics (`/platform/copilot-analytics`) — confusing screens.
- [ ] Row counts trend normally; no unexpected drops.
- [ ] Spot-check tenant isolation (a scoped user sees only their own rows).

---

## 10. Recommended next order

1. **Monitor production** (Day-1 checklist; enable PITR).
2. **Merge safe PRs after review** — #98 → #99 (resolve base path).
3. **Create staging + PITR + deploy-gate** (prevent-recurrence §6).
4. **Close the residual drift safely** via staging dry-run.
5. **Then resume AI** — Phase 2 eval in staging, flag-gated.

*Stabilization complete and review-ready. No further production changes made or
recommended this sprint.*
