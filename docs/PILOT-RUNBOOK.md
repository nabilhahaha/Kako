# Pilot Runbook (PR-5)

The operating plan for the first production pilot. Pairs with
`MIGRATION-READINESS.md` (cutover) and `ERP-INTEGRATION-REQUIREMENTS.md`
(data onboarding).

## 1. Pilot scope
- **1 branch · 2 routes · ~6–10 reps · 1 supervisor · 1 area/sales manager · 1
  company admin.**
- **1 product category** with real SKUs + brands; **1 channel**; a real customer
  list for the two routes.
- Modules in scope: Field Execution (visits/capture/coverage/alerts) +
  Commercial Performance (targets/actuals/achievement/commission/incentive) +
  one governed feature-flag rollout. TPM optional (define 1–2 promotions).
- **Out of scope:** offline photo queue, server-side PDF, target/promotion ERP
  sync, non-Odoo ERP adapters.

## 2. Pilot users & roles
| Role | Who | Exercises |
|---|---|---|
| Company admin | 1 | governance, scheduler, ERP sync, commission/incentive runs, targets |
| Area/Sales manager | 1 | commercial dashboard, targets, performance, scope |
| Supervisor | 1 | alerts inbox, coverage, team scope |
| Reps | 6–10 | route, visits, capture (merch/OOS/survey/opportunity), photos |
| Pilot/test user | 1 | governance "view as" preview before publish |

## 3. Timeline (~6 weeks)
- **W1** — prod migration (clone dry-run → cutover); sync customers + products;
  user/route/branch setup; `erp_sched_ensure_defaults()`.
- **W2–3** — field execution: route plans, visits, captures, coverage/compliance;
  alert detection scheduled; supervisor works the alert inbox.
- **W4** — targets (Excel import) → actuals → achievement/growth/RAG; verify the
  active actuals source.
- **W5** — one full **commission + incentive** run, reconciled against a manual
  spreadsheet; freeze the period. One governed feature flag → pilot preview →
  publish → (optional) rollback.
- **W6** — review against success criteria; decide go/no-go for wider rollout.

## 4. Success criteria
- ≥ 90% of planned visits logged; capture compliance ≥ 80%.
- Commission **and** incentive totals match the manual calc **to the cent**;
  freeze-after-approval holds.
- Achievement/growth/RAG reconcile to invoices for the pilot period.
- **Zero** cross-tenant or out-of-scope data exposure (verified via audit log).
- Dashboards load < 2 s on a mid-range phone.
- One configuration change safely piloted → published → rolled back.
- Scheduler shows green runs; no stale critical-job alerts unexplained.

## 5. Support process
- **Tier 1 (in-app/admin):** company admin uses Scheduler health, Sync dashboard,
  Alerts inbox, and Governance to self-diagnose (re-run jobs, re-ingest, inspect
  audit timeline).
- **Tier 2 (platform owner):** `/platform/audit` + per-company audit; re-run
  `erp_sched_tick()` / `erp_cfg_*` / `erp_sync_ingest`; inspect `erp_sync_map`
  errors and `erp_sched_runs`.
- **Escalation:** capture the failing entity id + `erp_audit_logs` / run id; file
  against the engineering backlog. Daily 15-min standup during W2–W5.
- **Comms:** a shared channel; SLA — critical (data wrong/blocked) same-day,
  major next-day, minor weekly.

## 6. Rollback process
- **Config:** revert via Governance (`/governance`) — per-change, no DB change.
- **A scheduled job misbehaves:** disable it in `/settings/scheduler` (no deploy).
- **A commission/incentive run is wrong:** it's draft until approved — re-run;
  if already frozen, raise a new corrective period (don't unfreeze paid history).
- **Bad ERP import:** re-ingest the corrected payload (source_wins overwrites);
  `cancelled` invoices drop from actuals automatically.
- **Schema-level:** restore from the pre-cutover backup/PITR point
  (`MIGRATION-READINESS.md §4`).

## 7. Go-live checklist
- [ ] Migration applied + smoke test passed (`MIGRATION-READINESS.md`)
- [ ] Customer + Product master synced (`ERP-INTEGRATION-REQUIREMENTS.md`)
- [ ] Sales transactions flowing (invoices or confirmed orders) + source set
- [ ] Reps/routes/branch/hierarchy configured; permissions verified per role
- [ ] Targets imported (Excel) for the pilot period
- [ ] Scheduler defaults registered; tick/stale running green
- [ ] Alert thresholds + RAG thresholds reviewed with the manager
- [ ] One commission + one incentive plan defined and test-run
- [ ] Backup/PITR point recorded; rollback owner named
- [ ] Pilot users trained (rep app + manager dashboards); support channel live
