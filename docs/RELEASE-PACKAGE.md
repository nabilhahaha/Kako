# Kako — Executive Release Package

> The single executive entry point for production, deployment, operational, and
> governance readiness. Documentation/planning only — **no production change is
> made by this package.** Prepared `2026-06-04`. Supersedes earlier pre-hotfix
> snapshots where they conflict.

---

## 1. Executive release report

**Where we are:** Production is **stable**. The invoicing outage is **resolved** —
migration `0118` was applied and validated, and a real invoice was created
(`123 → 124`). Nothing else in production was changed: no `0109`, no full drift,
no AI, no Wave 2. The codebase is green across 4 PRs and the full release
documentation is normalized and contradiction-free.

**Production health: 92 / 100** (was 72). Held below ~95 by residual migration
drift (42 files) and PITR not yet enabled.

**Headline Go/No-Go**
- **GO** — keep production on the `0118` fix; merge the green core PRs after
  review (reconcile `main` first); stand up staging; enable PITR.
- **NO-GO** — closing the 42-migration drift now, `migrate-production`/`db push`
  on the live DB, enabling `COPILOT_AI_ENABLED` in production, Wave 2, new modules.

---

## 2. PR status & definitive merge order

| PR | Scope | CI | State | Disposition |
| --- | --- | --- | --- | --- |
| **#98** | FMCG Wave 1 | ✅ green | ready | Content is a **subset of #99's branch**; deliver via the core merge, then close as superseded. |
| **#99** | Bug-hunt + full doc/release package | ✅ green (`c2219a5`) | ready | **The core release branch** (contains Wave 1 + bug-hunt + docs). |
| **#100** | AI strategy (roadmap) | ✅ green | draft | Parked; rebase onto `main` for AI Phase 2. |
| **#101** | Copilot AI V1 (flag-OFF) | ✅ green | draft | Parked; rebase onto `main` for AI Phase 2. |

**Stack (verified):** `enterprise-readiness ⊂ wave1 (#98) ⊂ bug-hunt (#99)`.
`main` has **2 divergent commits** (`7b47b8b`, `1c2d8dc` schema refactor) not in
the chain. **#100/#101 branched from an earlier bug-hunt tip** → need rebase.

**Definitive merge order** (do not merge without approval — see
`runbooks/MERGE-TO-MAIN.md`):
1. Reconcile `origin/main` → `claude/fmcg-bug-hunt` (resolve `1c2d8dc` conflicts).
2. Re-run full CI; must be green.
3. Merge `fmcg-bug-hunt → main` (delivers Wave 1 + bug-hunt in one); close #98 as included.
4. Deploy `main`; run post-deploy validation.
5. (Later) rebase + decide on #100/#101 for AI Phase 2.

---

## 3. Risk Register (ranked)

| ID | Risk | Rank | Mitigation / owner action |
| --- | --- | --- | --- |
| RK-1 | Residual drift (42 migrations) → future "missing object" outage if code ships ahead of it | **HIGH** | Build the deploy gate; close drift via staging; don't merge code depending on unapplied migrations. |
| RK-2 | No deployment gate (root cause of the invoicing incident) still unaddressed | **HIGH** | `DEPLOYMENT-GATE.md` — implement before/with drift closure. |
| RK-3 | Merge-to-main conflict with `1c2d8dc` (visit_reasons / raw_data_mappings refactor) | **HIGH** | Reconcile in a branch + re-run CI before merging (`MERGE-TO-MAIN.md`). |
| RK-4 | PITR not enabled → only coarse recovery | **MEDIUM** | `PITR-ENABLEMENT.md` — enable before drift closure. |
| RK-5 | `migrate-production` blind full replay is unsafe | **MEDIUM** | Rewrite to apply-pending-only. |
| RK-6 | `schema_migrations` version-scheme inconsistency | **MEDIUM** | Standardise convention; reconciliation script. |
| RK-7 | #100/#101 stale base → rebase needed | **MEDIUM** | Rebase onto `main` at AI Phase 2. |
| RK-8 | AI accidentally enabled in prod | **LOW** | Flag OFF default; no LLM wired; deterministic fallback. |
| RK-9 | Van reconciliation records variance but posts no stock adjustment | **LOW** | Known Wave-1 foundation; future wave. |
| RK-10 | No load/perf testing on new FMCG screens | **LOW** | Monitor Day-1; perf pass in 60-day window. |

**Critical: none active.** (The invoicing outage that was Critical is resolved.)

---

## 4. Technical Debt Register

| ID | Debt | Impact | Plan |
| --- | --- | --- | --- |
| TD-1 | `schema_migrations` mixes timestamp + `00XX` versions | Tooling can't reliably diff drift | Standardise (deploy-gate work). |
| TD-2 | `migrate-production` blind replay | Unsafe production migrations | Rewrite apply-pending-only. |
| TD-3 | No drift monitor / deploy gate | Drift can recur silently | `DEPLOYMENT-GATE.md`. |
| TD-4 | 78 security advisor WARNs (SECDEF functions w/o `search_path`/revoke) | Hardening gap (no ERROR) | Batch-pin `search_path` + revoke; DB-wide. |
| TD-5 | Perf advisors: 150 multiple-permissive-policies, 102 unused-index, 90 unindexed-FKs | Latency/scale | Perf pass (60–90 day). |
| TD-6 | PRs stacked on feature branches, not `main` | Release friction | Adopt main-targeted PRs going forward. |
| TD-7 | ESLint not configured (`next lint` scaffolding prompt) | No lint gate | Configure ESLint flat config. |
| TD-8 | AI audit migration `0144` not in production | Only when AI ships | Apply with AI Phase-2 enablement. |
| TD-9 | Van reconciliation: no stock-adjustment posting | Functional gap | Future FMCG wave. |

---

## 5. Platform Roadmap (30 / 60 / 90 days)

**30 days — stabilize & deliver core**
- Monitor production (Day-1 checklist); **enable PITR**.
- Reconcile `main` (`1c2d8dc`) into the release branch; **merge #98+#99 → main**; deploy.
- Stand up **staging** (prod-equivalent restore).
- Build the **deploy gate in warn mode**; standardise `schema_migrations` convention.

**60 days — close drift & harden**
- **Staging dry-run** of the 42 migrations on a prod copy → **close drift in a window**.
- Flip the **deploy gate to blocking**; rewrite `migrate-production` (apply-pending-only); add drift monitor + post-deploy invoice smoke.
- Start TD-4 (SECDEF `search_path`) + TD-5 high-value perf (unindexed FKs).

**90 days — AI & value**
- **AI Phase 2**: staging eval with a free-tier LLM (AR/EN accuracy via
  `erp_copilot_queries`), gradual per-env/per-company enablement (flag-gated);
  apply `0144` with it.
- FMCG functional follow-ons decision (van-recon stock posting, commission,
  AR/credit) — scoped as a future wave.
- Perf pass (unused-index cleanup, permissive-policy consolidation); ESLint gate.

---

## 6. Recommended next order (canonical)
1. **Monitor production** (Day-1; enable PITR).
2. **Merge safe PRs after review** — reconcile `main`, then #98 → #99 to `main`.
3. **Create staging + PITR + deploy-gate**.
4. **Close the residual drift safely** via staging dry-run.
5. **Then resume AI** (Phase 2, staging, flag-gated).

---

## 7. Package manifest (all deliverables)

**Status & readiness**
- `STABILIZATION-REPORT.md` — current authoritative production status.
- `EXECUTIVE-SUMMARY.md` — incident + outcome (post-hotfix banner).
- `RELEASE-READINESS.md` — readiness scores + checklists (pre-hotfix body, banner-superseded).
- `RELEASE-PACKAGE.md` — **this** executive package.

**Operations**
- `OPERATIONS-CHECKLISTS.md` — Day-1 Ops, UAT, Monitoring, Post-Deploy (definitive).

**Runbooks**
- `runbooks/README.md` — remediation index.
- `runbooks/EXECUTE-0118.md` — the executed hotfix record.
- `runbooks/HOTFIX-INVOICING.md` — hotfix package (executed).
- `runbooks/MIGRATION-DRIFT-REMEDIATION.md` — full drift mechanics.
- `runbooks/MERGE-TO-MAIN.md` — merge procedure.
- `runbooks/ROLLBACK-RUNBOOK.md` — app + DB rollback.

**Designs & plans**
- `PITR-ENABLEMENT.md` · `STAGING-DESIGN.md` · `DEPLOYMENT-GATE.md` ·
  `DRIFT-CLOSURE-PLAN.md`.

**AI (parked)**
- `AI-STRATEGY.md` (#100) · `AI-ARCHITECTURE.md` (#101) — Phase-2 plan; flag OFF.

*Documentation, architecture, governance, and planning only. No production
change, no migration, no live-data modification, no AI enablement.*
