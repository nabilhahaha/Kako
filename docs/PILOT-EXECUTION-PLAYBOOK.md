# Pilot Execution Playbook

*Operational excellence for the controlled FMCG pilot. Self-contained checklists; complements `DEPLOYMENT-PLAYBOOK.md` (merge/rollback detail) and `OPERATIONAL-READINESS.md` (executed proofs). Review-first — no production deployment.*

---

## 1. Final Pilot Execution Plan
**Goal:** one trusted FMCG company, live on VANTORA, running the real daily cycle, with tight monitoring and a clear exit.

**Phases & owners**
1. **Pre-flight (eng + ops):** integration validated (PR #82 green incl. 0110 on staging) → run staging k6 load test → backup/PITR drill → alerts configured. *(Go/No-Go §🔴.)*
2. **Production deploy (eng, guarded window):** manual `workflow_dispatch` migration apply (type `PRODUCTION`) of 0100→0117 → smoke test → tag release.
3. **Tenant provisioning (ops + pilot admin):** company/branches/users/roles → import customers+products → routes → workflows → credit policy. *(Checklist #2.)*
4. **Guided go-live (1 day, white-glove):** pilot admin + reps walk the core flow with eng on standby; fix blockers same-day.
5. **Run (2–6 weeks):** daily monitoring (#6); weekly check-in; triage via the 🟠 hardening backlog.
6. **Review & decide:** measure against Success/Failure criteria (#7) → expand / iterate / stop.

**Comms:** a shared channel with the pilot admin; same-day response SLA during go-live week; weekly summary.

## 2. First Pilot Customer Checklist
**Selection:** one cooperative FMCG distributor, 1–2 branches, 5–15 users, **≤ ~2–3k customers** (within the proven headroom), willing to give feedback.
**Provisioning (per `OPERATIONAL-READINESS.md` §5):**
- [ ] Company (business_type, currency, VAT/CR) · branch(es) · admin + users · roles.
- [ ] Customer master data verified (segments/classifications/channels/business types).
- [ ] Customers + Products imported (per-entity CSV), counts + required fields spot-checked.
- [ ] Routes + salesman/visit-day assignments.
- [ ] Approval workflows active; `customers_require_approval` set per policy; credit model + limits.
- [ ] Field-governance rules (if any) configured & **published**.
- [ ] Core-flow smoke as the admin: customer → order → invoice → issue → payment → statement; approvals; attachments.
- [ ] Training session done; support channel shared; feedback mechanism agreed.

## 3. Staging Deployment Checklist
- [ ] Migrations contiguous **0100–0117 (incl. 0110)**; **PR #82 "Apply migrations to STAGING" green**.
- [ ] CI green: Typecheck/build · Integration (DB) · Playwright.
- [ ] Staging `supabase_migrations` history matches files; no partial applies.
- [ ] Smoke: login · lists (pagination+search on customers/products/suppliers/inventory) · invoice/order/payment · approvals · field-governance · attachments.
- [ ] RLS isolation check with a 2nd test company (no cross-tenant reads).
- [ ] **k6 load test** run (`scripts/loadtest/`): p95 < 500 ms, error < 1%, index scans.
- [ ] Env/secrets present (Supabase keys, `SUPABASE_SERVICE_ROLE_KEY`, Sentry DSN).
- [ ] Eng + product sign-off.

## 4. Production Deployment Checklist
- [ ] Staging checklist fully passed; pilot tenant plan ready.
- [ ] **Backup taken immediately before**; PITR confirmed enabled.
- [ ] Low-traffic maintenance window scheduled; stakeholders notified.
- [ ] Apply migrations via guarded **`workflow_dispatch` → type `PRODUCTION`** (`PRODUCTION_DATABASE_URL` secret); numeric order, one run; watch logs.
- [ ] Verify migration history + key-table reads; non-destructive production smoke.
- [ ] Sentry receiving events; dashboards/alerts live.
- [ ] Pilot admin availability check → open access.
- [ ] Tag release; record migration high-water mark **0117** + commit SHA.
- [ ] **No demo/seed scripts on production.**

## 5. Rollback Checklist
| Trigger | Action | Target |
|---|---|---|
| Code/UX defect | Redeploy previous Vercel build (changes are additive / safe-default) | ≤ 15 min |
| Bad migration | **PITR restore** to just-before-apply (preferred over hand down-SQL) | ≤ 1 h |
| Data corruption / tenant issue | **PITR restore** to last-good timestamp | RPO ≤ 5 min |
| Single additive object | Apply that migration's commented rollback **only** after confirming no dependent data | — |
- [ ] Identify trigger + scope (tenant vs platform).
- [ ] Capture failure (logs, migration, commit SHA) before acting.
- [ ] Execute the matching action; verify with smoke + counts.
- [ ] **Never edit an applied migration** — add a corrective migration.
- [ ] Post-incident note + follow-up.

## 6. Daily Pilot Monitoring Checklist
**Each morning (ops, ~10 min):**
- [ ] Sentry: new/elevated errors overnight? triage P1s.
- [ ] Supabase: DB CPU, connection saturation, **slow-query log** (watch count/search/offset at the tenant's data size).
- [ ] Uptime check green; latency within SLO (list p95 < 500 ms).
- [ ] Approvals inbox not stuck; workflow tasks flowing.
- [ ] Failed background jobs / webhook deliveries (if integrations used).
- [ ] Backup ran (last 24 h) + PITR window healthy.
- [ ] Pilot channel: open issues / blockers; same-day triage.
**Weekly:** usage (active users, orders/invoices/payments counts), data growth (audit/notifications tables), feedback review, 🟠 backlog grooming.

## 7. Pilot Success / Failure criteria
**✅ Success (proceed to first paying customer):**
- Core daily cycle (customer → order → invoice → payment → statement) runs **end-to-end without eng intervention** for ≥ 2 consecutive weeks.
- **Stability:** no P1 incidents; error rate < 1%; list p95 < 500 ms at the tenant's data size.
- **Adoption:** target users active daily; reps logging visits/orders; finance collecting via the system.
- **Data integrity:** balances/AR reconcile; no cross-tenant leakage; approvals + status gates behave.
- **Onboarding:** tenant went live within the planned window; import + setup completed.
- **Feedback:** issues are usability/enhancement, not architectural.

**⚠ Conditional (iterate, don't expand):**
- Recurring usability friction or a 🟠 gap (e.g., role dashboards, search quality) blocking daily use → fix in a short sprint, re-evaluate.

**🛑 Failure (stop & reassess):**
- Repeated P1s, data-integrity or isolation defects, unrecoverable performance at the tenant's scale, or the customer cannot run the daily cycle after remediation.

**Exit:** a written pilot review against these criteria → decision (expand / iterate / stop) + the prioritized list for the first paying customer.

---

*Execution playbook only. No merge, no production deployment, no production migrations.*
