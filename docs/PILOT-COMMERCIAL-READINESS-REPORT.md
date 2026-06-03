# VANTORA — Pilot & Commercial Readiness Report

*Consolidated readiness assessment · review-only · no code, no merge, no production migrations. Synthesizes the DB Scalability Review, UX/Performance Review (+ remediation R1–R4), DFG Completion Report, and the Standard List Architecture.*

Classification legend: **🔴 Before Pilot** · **🟠 Before First Paying Customer** · **🟢 Can Wait**.

---

## Executive summary & verdict
The platform is **feature-complete and staging-validated** for a controlled FMCG pilot. Core ERP, multi-tenant RLS, the generic workflow/approval engine, customer hierarchy + status, attachments, Dynamic Field Governance, and the standard list framework are built and green (PRs #78–#82, all draft/held). 

**Verdict:**
- **GO for a controlled pilot** after a small **🔴 Before-Pilot** set (deploy the stack, ship the few UX must-fixes, run a baseline load test).
- **Not yet commercial-ready** — by design. Commercialization needs the Phase-1 capabilities (Feature Flags, Global Search, Notification Center, Import Center, role dashboards), a real load test, a security review, and the Billing platform (Phase 3).

The honest headline risks: **(a) the stack is not yet merged/deployed**, **(b) no large-scale load test has been run**, **(c) support tooling (impersonation) and self-serve onboarding/import are thin**, **(d) scoped-role RLS evaluates row-by-row** (the DB review's main bottleneck).

## Remaining-items register (classified)
| Item | Area | Class |
|---|---|---|
| Merge stack in order (#78→#82) + sequence 0110; apply migrations staging→prod in one guarded window (R3) | Deploy | 🔴 |
| Inventory list → standard pagination/search (stock-join) | Perf/UX | 🔴 |
| Baseline **load test** (10 co × ~25k customers, 12 mo txns) on staging | Scale | 🔴 |
| Security review of the new stack (RLS, governance redaction, status gates) | Security | 🔴 |
| `not-found.tsx` (app-chrome 404) (S5) | UX | 🟠 |
| Sortable column headers + default-sort wiring | UX | 🟠 |
| Filtered export (batched, 50k cap) | UX | 🟠 |
| Mobile filter drawer + Pager polish | UX | 🟠 |
| Role-tailored dashboards (rep/finance/collection/warehouse) (S3) | UX | 🟠 |
| Global quick-create + ⌘K record jump (S4) | UX | 🟠 |
| Dashboard scans → active-only filters | Perf | 🟠 |
| Retention/clean-up jobs (audit, notifications, completed workflows) | Scale/Ops | 🟠 |
| Count-mode cutover to `planned` for >100k tables | Scale | 🟠 |
| Publish/Rollback → transactional RPC (R1) | Arch | 🟠 |
| Scoped-role RLS row-by-row → index-friendly `salesman_id` path | Scale | 🟠 |
| Materialized/pre-computed report summaries (AR aging, sales) | Perf | 🟠 |
| Pre-computed report summaries + read replica | Scale | 🟢 |
| Field-value inheritance wiring (R4) + FP-0c (credit/consolidation) | Feature | 🟢 |
| DB column-level read privileges (vs app-layer redaction) | Security | 🟢 |
| Table partitioning (10M+ tables) · cold-tenant archiving | Scale | 🟢 |
| Saved views, favorites, virtualization, AI assistant, billing platform | Roadmap | 🟢 |

## Readiness assessment (8 areas)
| Area | Status | Key gaps | Class of gaps |
|---|---|---|---|
| **Architecture** | ✅ Strong | per-company RLS on every table, generic engines (workflow, entity registry, DFG), modular; long **unmerged stack** to land; a few inert columns (inheritance) | 🔴 deploy / 🟢 inheritance |
| **Security** | ◐ Good, verify | RLS + permissions + admin lockout + audit + governance redaction; **app-layer (not DB) read redaction**; **no impersonation**; **stack security review pending**; secrets/keys handling review | 🔴 review / 🟢 DB-column |
| **Performance** | ◐ Improving | standard pagination shipping; 0110 indexes; per-page redaction done; **no load test yet**; dashboard full-table scans | 🔴 load test / 🟠 dashboard |
| **Scalability** | ◐ Designed, unproven | targets 50 co / 500 users / 250k customers / millions txns; one-page fetch; **scoped-role RLS row-by-row**; count-mode cutover; retention/partitioning later | 🟠/🟢 |
| **Data migration** | ◐ Basic | per-entity CSV import exists (customers/products); demo seed; migrations immutable + staging-validated; **Import Center (validation/preview/rollback) is roadmap** | 🟠 import center |
| **Onboarding** | ◐ Adequate (assisted) | `/onboarding` + `/setup` wizard + getting-started checklist; **full Onboarding Wizard is roadmap**; fine for assisted pilot, thin for self-serve | 🟠 wizard |
| **Support** | ◐ Thin | audit log + platform audit viewer + Sentry error boundary; **no impersonation** (diagnosis harder); notifications basic; **no runbooks/alerting/SLOs** | 🟠 impersonation/runbooks |
| **Commercial** | ✗ Not ready (expected) | subscription scaffolding only; **Billing/entitlements/usage = roadmap (Phase 3)**; Feature Flags (Phase 1) needed first | 🟢 (post-pilot) |

## Risk register by scale
### First 10 customers (controlled pilot) — *stability & onboarding*
- **Operational, not technical.** Per-tenant data is small → list/dashboard perf is fine.
- **Hidden risks:** stack not deployed (R3); **manual data import errors** (no validation/rollback yet); **support without impersonation** (slow diagnosis); no monitoring/alerting; no automated backups verification.
- **Tech debt:** inert inheritance column; ad-hoc per-entity imports; dashboard not role-tailored.
- **Mitigation:** deploy carefully (ordered merge + staging validation), white-glove onboarding + import review, basic alerting, confirm backups/restore.

### First 100 customers — *performance & operations*
- **Scalability bottlenecks emerge for any large tenant:** unbounded screens already fixed (S1), but **scoped-role RLS row-by-row** on `erp_customers`/invoices and **dashboard full-table scans** start to bite; **count(exact)** cost on big lists.
- **Growth risks:** **audit/notifications/workflow tables grow unbounded** (need retention jobs); report aggregates run live (need summaries); support volume needs **Notification Center + Impersonation** and **role dashboards**.
- **Onboarding:** manual import won't scale → **Master Data Import Center** + **Onboarding Wizard**.
- **Mitigation:** count-mode cutover, scoped-RLS index path, retention jobs, materialized summaries, Phase-1 capabilities.

### First 1,000 customers — *true scale & commercialization*
- **Scalability:** **table partitioning** for 10M+ rows (stock movements, invoice/journal lines, audit), **read replica** for analytics, **cold-tenant archiving**; per-tenant isolation holds but the RLS scope functions must be optimized.
- **Commercial:** **Billing/entitlements/usage metering**, **automated provisioning** (Onboarding Wizard), **Feature Flags** for tiered plans, **Integration Health** for support at scale.
- **Operational:** SLOs, on-call, capacity planning, DR drills.
- **Mitigation:** the Phase-2/3 roadmap (partitioning, billing, impersonation, integration health) — none are blockers before this scale.

## Recommended pre-pilot checklist (🔴 Before Pilot)
1. **Deploy:** rebase + ordered bottom-up merge (#78→#82, sequence 0110); staging-apply after each; production migrations in one guarded window.
2. **Inventory list** → standard pagination/search (the last unbounded core list).
3. **Baseline load test** on staging (seed ~10×25k customers + 12 mo txns; p95 on list/search/dashboard/approvals; with/without `planned` count).
4. **Security review** of the new stack (RLS, governance redaction completeness, status gates, attachments storage RLS).
5. Confirm **backups + restore** and basic **error alerting** (Sentry already wired).

## Recommended pre-first-paying-customer checklist (🟠)
Sortable headers + filtered export + mobile polish · role dashboards · `not-found.tsx` · dashboard active-only filters · retention/clean-up jobs · publish/rollback RPC · scoped-RLS index path · report summaries · Master Data Import Center · Onboarding Wizard v1 · Notification Center · Impersonation (read-only) · runbooks/alerting/SLOs.

---

*Assessment only. No code, no merge, no production migrations. Production remains on hold.*
