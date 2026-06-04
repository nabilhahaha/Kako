# Go-Live Sign-Off & Launch Recommendation

*Final sign-off for the controlled FMCG pilot. Engineering hardening is complete and staging-validated; the five remaining gates are **operator actions on the live Supabase/host** (cannot be executed from the build environment). No merge, no production deployment performed.*

---

## Engineering sign-off — ✅ SIGNED (conditional on operator gates)
The platform is engineering-ready for the pilot:
- **Migrations 0100→0119 apply clean** and are **staging-validated** (PR #82 "Apply migrations to STAGING" green, incl. 0110 indexes, 0118 idempotency, 0119 retention).
- **Tests green:** 337 unit + 20 integration (isolation, financial integrity, idempotency, retention, governance, status gates).
- **Verified strong:** multi-tenant isolation (RLS on all tables, 0 permissive policies), financial integrity (atomic RPCs, balanced journals, ON DELETE RESTRICT, **payment idempotency**), numbering race-free, scoped-RLS indexed, count-cutover + retention for scale.
- **Readiness score: 85/100 — GO (conditional).** No code blockers.

## The five operator gates (execute on the live project, then tick)
> Each has a ready, validated artifact/runbook. These require Supabase/host credentials + decisions and must be done by the operator.

### 1. Staging k6 execution
- [ ] Seed staging (`scripts/loadtest/seed.sql`, ~10 tenants × 25k); `BASE/COOKIE k6 run scripts/loadtest/k6-lists.js` ramped to 50→500 VUs.
- [ ] **Pass:** p95 < 500 ms, error < 1%, slow-query log shows index scans. Record results.

### 2. Supabase PITR + Storage recovery drill
- [ ] Confirm daily backups + **PITR enabled**; confirm **Storage (attachments bucket) is backed up**.
- [ ] Restore to a clone/branch → verify counts + migration history + app boots.
- [ ] Run **`scripts/ops/reconcile-attachments.sql`** → **missing_files = 0**. Record RTO/RPO (targets ≤2h / ≤5min).

### 3. Alerting configuration
- [ ] Sentry error-rate + new-issue alerts → ops channel; release tagging.
- [ ] Supabase alerts: DB CPU, connections, disk, slow-query; uptime check on app + health route.
- [ ] Define SLOs (list p95 < 500 ms, availability 99.5%); **fill the escalation matrix** (contacts + after-hours).

### 4. Production deployment readiness
- [ ] Choose merge strategy (Strategy B integration release `release/pilot`/PR #83 recommended; ensure 0110 included → chain 0100–0119 contiguous).
- [ ] **Backup immediately before**; apply via guarded **`workflow_dispatch → type PRODUCTION`** in one low-traffic window.
- [ ] Verify migration history + non-destructive smoke; confirm Sentry events; tag release at **0119**.

### 5. First pilot tenant onboarding
- [ ] Provision company/branches/users/roles (Pilot Operations Manual + Execution Playbook checklists).
- [ ] Assisted import of customers + products (per-entity CSV); spot-check counts + required fields.
- [ ] Routes + workflows + credit policy; **smoke the core cycle** (customer→order→invoice→payment→statement; approvals; attachments).
- [ ] Confirm against the **recommended first-customer profile** (FMCG distributor, 1–2 branches, 5–15 users, 500–2,500 customers, credit + collections).

## Launch recommendation
**GO for the controlled FMCG pilot once gates 1–5 pass.** Engineering has eliminated the in-scope stability/scalability/security risks and validated the full release on staging. The only path between here and launch is the operator executing the five gates above — all scripted, checklisted, and low-risk.

**After launch:** run the Daily/Weekly ops checklists (Operations Manual), watch the Success/Failure criteria (Execution Playbook), and address the 🟠 "before first paying customer" backlog (pentest, Import Center, impersonation, pg_trgm search) as the hardening sprint.

## Document set (for the operator)
`PILOT-GO-NO-GO.md` · `DEPLOYMENT-PLAYBOOK.md` · `PILOT-EXECUTION-PLAYBOOK.md` · `PILOT-OPERATIONS-MANUAL.md` · `BEFORE-PILOT-VALIDATION.md` · `OPERATIONAL-READINESS.md` · `HARDENING-RISK-REGISTER.md` · `HARDENING-CLOSURE.md` · `FINAL-PILOT-READINESS-REVIEW.md` · `PILOT-LAUNCH-READINESS.md` · `scripts/loadtest/` · `scripts/ops/reconcile-attachments.sql`.

---

*Sign-off & recommendation only. No new features, no UI changes, no roadmap expansion, no merge, no production deployment. Production remains on hold pending the operator gates.*
