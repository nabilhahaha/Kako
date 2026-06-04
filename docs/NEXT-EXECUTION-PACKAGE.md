# Kako — Next Execution Package (planning only)

> No implementation, no production change, no migration. Prepared `2026-06-04`.
> Six execution packages in priority order + a sprint-planning matrix. Builds on
> the design docs already in `docs/` (PITR, Staging, Deploy-Gate, Drift). Effort
> and cost figures are **estimates to confirm**, not commitments.

---

## 1. PITR Enablement Plan

**Goal:** enable Point-in-Time Recovery (currently OFF; scheduled physical
backups ON, latest verified `04 Jun 07:39 UTC`). Prerequisite for safe drift
closure.

**Exact steps (operator, dashboard)**
1. Supabase → Project Settings → Database → **Point in Time Recovery**.
2. Verify the plan tier includes PITR; if not, upgrade (cost below) — **business decision**.
3. Enable PITR; set retention **≥ 7 days**.
4. Wait for the WAL baseline; confirm an advancing "earliest recoverable" timestamp.
5. **Drill (in staging):** restore to ~5 min ago, verify schema + sample rows, record time-to-recover.
6. Update ops log + Day-1 checklist to "PITR: ON".

**Cost (estimate, confirm in dashboard):** PITR is a paid Supabase add-on —
typically on the order of **~$100/mo+** depending on retention window and compute
add-on size. May require a **plan upgrade**. Net new infra otherwise: none.

**Impact:** non-disruptive to enable (no downtime). Gains second-level recovery
granularity; unblocks the drift closure's rollback story.

**Rollback considerations:** enabling PITR is itself low-risk and reversible
(disable in dashboard). The *value* is in rollback for future changes: once ON,
PITR becomes the **primary** rollback for multi-object migrations, replacing the
coarse physical-restore (which loses post-snapshot writes).

---

## 2. Staging Environment Plan

**Architecture**
- **Staging Supabase project** (separate from `kako-fmcg`) for long-lived UAT + AI
  eval; **and/or** a short-lived **Supabase preview branch** for migration dry-runs.
- **Staging Vercel environment** wired via env vars to the staging Supabase
  URL/keys (mirrors prod; never points at `kako-fmcg`).
- Secret `STAGING_DATABASE_URL` (already referenced by `migrate-staging.yml`).

**Estimated cost:** a second Supabase **Pro project ≈ $25/mo** (+ optional compute);
Vercel staging typically within the existing plan. **≈ $25–60/mo.**

**Data strategy**
- *Migration dry-run:* **restore the latest physical backup (or PITR copy) of
  production into staging** → staging mirrors the applied-through-`0118` state →
  apply the 39 pending migrations there.
- *UAT / AI eval:* anonymized subset (no real PII), or synthetic tenants.

**Validation workflow**
1. Refresh staging from a prod restore.
2. `migrate-staging.yml` applies pending migrations (on a **reset** staging).
3. Run `test:db` + smoke + UAT (`OPERATIONS-CHECKLISTS.md`).
4. Deploy the release commit to staging Vercel; run post-deploy checklist.
5. (Later) flag-ON AI eval in staging only.

**Acceptance:** staging reachable + isolated; prod-equivalent restore verified;
the 39 migrations apply clean on the restored copy; `test:db`+smoke+UAT green;
documented refresh/teardown.

---

## 3. Deploy Gate Design

**Goal:** make it impossible to ship app code whose required migrations aren't
applied on the target DB (the root cause of the invoicing incident).

**Components**
1. **Migration↔DB reconciliation (the gate):** compare repo migrations vs the
   target's `schema_migrations`; **block** if any required migration is unapplied.
   *Prereq:* standardise the `schema_migrations` version scheme (numeric `00XX`
   vs live timestamps) so the diff is reliable.
2. **Wire as a required status check** before the Vercel **production** promotion +
   on the merge-to-main PR. Preview/staging exempt.
3. **Post-deploy invoice smoke test:** automated probe creates (synthetic tenant or
   create-and-rollback) + asserts invoice creation works; failure → alert +
   rollback candidate.
4. **Schema-cache reload step:** every apply ends with `NOTIFY pgrst,'reload schema'`.
5. **Drift-detection monitor (scheduled):** alerts when any env falls behind repo.
6. **Replace `migrate-production`:** apply-**pending-only**, in order, idempotent,
   under the standardised convention; require the backup/PITR pre-flight.

**Release checklist (gate-enforced)**
- [ ] All required migrations applied on the target (gate green).
- [ ] Backup/PITR confirmed.
- [ ] CI green on the merge commit.
- [ ] Schema cache reloaded post-apply.
- [ ] Post-deploy invoice smoke passes.

**Rollout:** ship the gate in **warn** mode first (observe), then flip to
**blocking**.

---

## 4. Residual Drift Closure Plan

**Scope (accurate):** **39 migration files** remain unapplied (repo has numbering
gaps at `0120/0126/0127`; `0118` is applied — excluded). Apply **in numeric
order**; the groups below are **validation checkpoints**, not a reordering.

| Group | Files | Theme | Risk |
| --- | --- | --- | --- |
| G1 | `0099`,`0100` | Company trial + subscription canonical | **LOW** (additive) |
| G2 | `0103`,`0104`,`0105` | Customer model + hierarchy/txn **scope RLS** | **HIGH** (visibility cutover) |
| G3 | `0106` | Pricing engine | **MEDIUM** |
| G4 | `0107`,`0108`,`0109` | Pilot hardening perms + import + customer approval | **MEDIUM** (`0109` verified zero-impact backfill) |
| G5 | `0110`–`0113` | Composite indexes, attachments, customer hierarchy, **status blocking** | **MED-HIGH** (`0113` adds sales-blocking trigger) |
| G6 | `0114`–`0117` | Field governance (config/sections/templates/versions) | **MEDIUM** |
| G7 | `0119`,`0121`–`0123` | Retention cleanup, per-assignment scope, role limits/routing, section binding | **MEDIUM** |
| G8 | `0124`,`0125` | P6 finer capabilities + admin manage role-perms | **MEDIUM** (permission surface) |
| G9 | `0128`–`0136` | **FMCG ops spine** (master ext, journey, transfers, GPS, day-close, van transfers, perms, copilot log, settings) | **MED-HIGH** (largest block) |
| G10 | `0137`–`0143` | **Wave 1 value** (UOM/pricing, van recon, targets, returns, credit, perms, search) | **MEDIUM** (already validated end-to-end on the disposable branch) |

**Highest-risk to gate carefully:** G2 (`0104/0105` RLS scope), G5 (`0113`
status-blocking), G9 (big ops block).

**Recommended execution order (in staging first, then production):**
G1 → G2 → G3 → G4 → G5 → G6 → G7 → G8 → G9 → G10, **with a validation checkpoint
after each group** (counts, advisors, RLS smoke, key sentinel objects).

**Staging dry-run sequence**
1. Restore prod copy into staging (applied-through-`0118`).
2. Apply **G1→G10 in order**, pausing after each group to run `test:db` + smoke +
   targeted checks (e.g., after G2: scoped-user visibility; after G5: a blocked
   customer can't be sold to; after G9/G10: journey/UOM/targets functional).
3. Confirm `supabase db push` (or chosen tracker) reports **zero pending**.
4. Fix any surprise in staging; only then schedule the production window.

**Production prerequisites (hard):** PITR ON · staging dry-run green ·
`schema_migrations` convention decided · maintenance window for the RLS cutover.
**NO-GO:** `db push` / blind `migrate-production`.

---

## 5. Manager Dashboard Sprint Design

**Goal:** a supervisor/manager command view — visibility + actionability — reusing
existing RLS-scoped data (no new data path, additive).

| Widget | Source (existing) | Notes |
| --- | --- | --- |
| **Coverage** | `erp_work_sessions.coverage_pct` (own team via RLS) + `coverageBand()` | route/team coverage today |
| **Route Health** | `summarizeAttention()` over compliance flags | single health score per route/team |
| **Lost Customers** | customers with no visit/order in N days (RLS-scoped query) | churn-risk surfacing |
| **Pending Approvals** | `erp_workflow_instances`/visit/day-close/transfer counts (already in `nextBestActions`) | one-tap to the queue |
| **Stock Risk** | low/again-stock + van variance (`erp_van_reconciliations`) | exception cards |
| **Team Performance** | `erp_target_achievement` + `erp_sales_summary` | achievement % per rep |

**Design**
- Reuse `StatCard` (+ proposed additive `trend`/`hint` props), `Card`, `Badge`,
  `EmptyState`; build on `attention.ts` (already shipped on the UX branch).
- Mobile-first; exceptions-first ordering; every card links to its drill-down.
- Permission-gated (`reports.view` / supervisor perms); bilingual.

**Risk:** LOW (additive page + widgets; reuses authorized reads). No migration.
**Dependency:** ideally lands after the Attention Center (PR #102) merges (shares
`attention.ts`).

---

## 6. Search Excellence Sprint Design

**Goal:** make search feel like a modern SaaS product, building on the existing
`SearchCombobox` / `combobox-reducer` (Wave 1).

| Feature | Approach |
| --- | --- |
| **Recent searches** | per-entity, stored client-side (localStorage); shown on focus before typing |
| **Suggested searches** | KB/context-driven (e.g., top customers/products for the rep); from existing RLS-scoped lists |
| **Grouped results** | group by channel/route/category in the dropdown (presentational) |
| **Highlighting** | wrap matched substring in results (pure formatter + test) |
| **Mobile-first UX** | larger tap targets, sticky input, debounced, keyboard up/down (already partial) |

**Design**
- Extend the **pure `combobox-reducer`** with `recent`/`groups` state (unit-testable;
  no I/O) — keeps risk low.
- Presentational changes in the combobox component; no server/API change.

**Risk:** LOW-MED (touches a shared component used in production paths — gate with
typecheck/build/tests + preview review). No migration.

---

## 7. Sprint planning matrix

Scores 1–10 (higher = more value / more risk). Effort in dev-days (estimate).

| # | Sprint | Effort | Business value | Risk | Expected impact on VANTORA value |
| --- | --- | --- | --- | --- | --- |
| 1 | **PITR Enablement** | ~0.5 d (+ cost decision) | 8 | **2** | Resilience baseline; unblocks safe drift closure |
| 2 | **Staging Environment** | ~2–4 d | 8 | 3 | Enables safe migration + AI validation; de-risks everything after |
| 3 | **Deploy Gate** | ~3–5 d | 9 | 4 | **Eliminates the incident class** (code-ahead-of-schema); durable governance |
| 4 | **Drift Closure (39)** | ~3–5 d (+ window) | 9 | **7** | Removes the largest latent outage risk; full schema parity |
| 5 | **Manager Dashboard** | ~3–5 d | 9 | 2 | **Differentiator** — supervisor visibility; daily-driver value |
| 6 | **Search Excellence** | ~2–4 d | 7 | 3 | Modern SaaS feel; faster field workflows |

**Recommended sprint order**
1. **PITR Enablement** (fast prereq; resolve the cost decision).
2. **Staging Environment** (prereq for 3 & 4; can start in parallel with 1).
3. **Deploy Gate** (prevent recurrence; can overlap staging).
4. **Drift Closure** (requires 1 + 2; the big risk-down).
5. **Manager Dashboard** (highest value-to-risk among feature work; after #102 merges).
6. **Search Excellence**.
> AI Phase 2 (staging eval, flag-gated) slots after #4 (production stable) and can
> run alongside #5/#6.

**Rationale:** sequence **de-risks first** (1–4 make production safe and prevent
recurrence), then **harvests value** (5–6). Items 1–3 are low-risk enablers;
item 4 is the only high-risk sprint and is fully gated by 1–2; items 5–6 are
additive, low-risk, high-value differentiators.

---

## 8. Decisions required (business)
1. **PITR plan upgrade** (cost) — gates drift closure timing.
2. **Staging tier** (standalone project vs preview branch; budget).
3. **`schema_migrations` convention** (numeric vs timestamp) — gates deploy gate + drift.
4. **Maintenance window** for the RLS cutover (G2/G5/G9).

*Planning and execution packages only. No code, no migration, no production
change.*
