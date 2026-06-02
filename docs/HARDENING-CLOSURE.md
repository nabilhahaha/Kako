# Hardening Closure — pilot operational stability

*Index of the hardening priorities → what's **delivered (code/script/proof)** vs **ops-pending (staging/Supabase actions)**. Feature freeze in effect. No merge, no production deployment.*

| # | Priority | Delivered | Ops-pending (gate) |
|---|---|---|---|
| **1** | **Storage ↔ DB backup consistency** | ✅ **`scripts/ops/reconcile-attachments.sql`** — finds missing-files (DB row → no Storage object) + orphan-files; validated locally. Run **after every restore + weekly**. | Run on staging/prod; confirm Supabase **Storage** is backed up alongside DB PITR; consistent restore order (DB→Storage to the same point). |
| **2** | **Real staging load test** | ✅ **`scripts/loadtest/`** (seed + k6, p95<500ms/err<1% thresholds) + measured DB-layer numbers (page 0.45–1.75 ms, scoped 0.36–1.1 ms, count 21 ms, search 16 ms @100k **with 0110**). | Execute k6 on staging at 50→500 VUs; review slow-query log; flip count→`planned` >100k. |
| **3** | **Monitoring & alert verification** | ✅ Instrumentation verified in code (Sentry `error.tsx`/`global-error.tsx`/configs, loading skeleton, `friendlyDbError`); alert/SLO spec in **Operations Manual §7**. | Configure Sentry/Supabase/uptime alerts + SLOs; route to ops channel. |
| **4** | **Pilot deployment readiness** | ✅ **`release/pilot`** integration branch (full **0100–0117 incl. 0110**, +0118) — full chain applies clean; **staging-validated via PR #82**; **PR #83** = merge artifact; `DEPLOYMENT-PLAYBOOK.md` + `PILOT-EXECUTION-PLAYBOOK.md` (staging/prod/rollback checklists). | Pick merge strategy; guarded `workflow_dispatch → PRODUCTION` apply in one window; smoke + tag. |
| **5** | **Pilot support & incident response** | ✅ **`PILOT-OPERATIONS-MANUAL.md`** — incident severities + flow, escalation matrix, support playbook, customer-support process, common-failure recovery table. | Fill escalation contacts + after-hours path before go-live. |

## New hardening shipped this phase (code, staging-validatable)
- **0118 payment/invoice idempotency** — retries can't duplicate a payment/invoice (atomic, race-safe; proven by integration test: same key → 1 payment, balance −once).
- **`reconcile-attachments.sql`** — the storage↔DB DR-consistency check (SE2 risk closed operationally).

## Risk-register movement (`HARDENING-RISK-REGISTER.md`)
- **ST1 payment idempotency → RESOLVED** (0118).
- **SE2 storage↔DB consistency → mitigated** (reconciliation script + procedure; backup-verify must include Storage — in Operations Manual).
- Cleared earlier: RLS coverage complete · numbering race-free · no app-side connection pool (PostgREST).

## What remains before launch (all ops, none code-blocked)
Execute on staging: **k6 load test · PITR + Storage restore drill (then run `reconcile-attachments.sql`) · alert/SLO config · escalation contacts** → then the **guarded production deploy** per the playbook.

*Closure index only. No new features, no UI expansion, no roadmap additions, no merge, no production deployment.*
