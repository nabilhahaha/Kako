# Platform Capabilities — Roadmap & Architecture Review

*VANTORA · design/review only — no implementation, no merge, no production migrations. Sequenced to run **after** the current UX/Performance hardening (S1–S6).*

Complexity key: **S** ≤ few days · **M** ~1 sprint · **L** ~2–3 sprints · **XL** multi-sprint.
Existing foundations are noted so we reuse, not rebuild.

---

## 1. Global Search
- **Business value:** Find any customer/invoice/product/order instantly — the #1 daily-speed feature for a SaaS ERP.
- **Architecture impact:** Extend the existing **⌘K command palette** (today: nav only) to records. Add a unified search RPC (`erp_global_search(q)`) querying indexed columns across entities with RLS + permission scoping; reuse the S1 `ilike`/`pg_trgm` search story.
- **Dependencies:** S1 search columns/indexes; pg_trgm + Arabic normalization (from the list-arch doc) for quality.
- **Complexity:** **M**.
- **Recommended phase:** Phase 1.
- **Class:** **Must-Have.**

## 2. Saved Views
- **Business value:** Reps/finance save their working filters ("my overdue", "Riyadh key accounts") — retention + daily efficiency.
- **Architecture impact:** Already designed in the Standard List Architecture — a view = a stored query string. `erp_list_views(user_id, company_id, entity, name, params jsonb, is_shared)` + a picker. Zero new query logic (URL-driven).
- **Dependencies:** S1 (URL-persisted list state) — **done**.
- **Complexity:** **S**.
- **Recommended phase:** Phase 1.
- **Class:** Nice-to-Have (high ROI, cheap).

## 3. Notification Center
- **Business value:** One place for approvals, overdue alerts, low-stock, workflow tasks — drives action, reduces missed work.
- **Architecture impact:** **`erp_notifications` + `/notifications` already exist.** Enhance into a center: unread badge, grouping, mark-all-read, deep links, optional realtime (Supabase channels). Wire more producers (workflow, credit, expiry, status changes).
- **Dependencies:** workflow engine, status/credit events (exist).
- **Complexity:** **M**.
- **Recommended phase:** Phase 1.
- **Class:** **Must-Have.**

## 4. Universal Timeline
- **Business value:** Per-record activity history (who did what, when) — trust, audit, support, collections context.
- **Architecture impact:** Compose from existing sources — **`erp_audit_logs`** + workflow instances/tasks + `erp_attachments` + entity notes + status-change history — into a per-`(entity, record)` timeline component + a read RPC. No new write path.
- **Dependencies:** audit (exists), attachments (#79/#?), notes, workflow.
- **Complexity:** **M**.
- **Recommended phase:** Phase 2.
- **Class:** Nice-to-Have (strong for enterprise trust).

## 5. Data Quality Dashboard
- **Business value:** Surfaces missing/invalid data (no tax number, missing geo, duplicates, unapproved, over-credit, stale customers) — clean data = reliable reporting + onboarding quality.
- **Architecture impact:** Read-only rule pack over existing tables; ties to **DFG required-fields** (a field marked required but empty = a quality finding). A `erp_data_quality_checks` registry + scheduled scan or on-demand.
- **Dependencies:** DFG (required rules), composite indexes.
- **Complexity:** **M**.
- **Recommended phase:** Phase 2.
- **Class:** Nice-to-Have.

## 6. Quick Actions
- **Business value:** One-tap New Invoice / New Customer / Record Payment from anywhere — fewer clicks, faster field/desk work.
- **Architecture impact:** Small. A global action menu (dashboard + mobile "＋") + ⌘K actions; reuses existing create flows & permissions. Already a UX-review **S4** item.
- **Dependencies:** permissions; nav.
- **Complexity:** **S**.
- **Recommended phase:** Phase 0 (fold into the hardening sprint).
- **Class:** **Must-Have.**

## 7. Favorites
- **Business value:** Pin frequent customers/products/reports/views to a personal shortcuts bar — power-user retention.
- **Architecture impact:** `erp_favorites(user_id, entity, record_id|href, label)` + a nav section. Overlaps Saved Views (both are "pinned URLs").
- **Dependencies:** nav; Saved Views (share the storage pattern).
- **Complexity:** **S**.
- **Recommended phase:** Phase 2.
- **Class:** Nice-to-Have.

## 8. Bulk Actions
- **Business value:** Operate on many rows at once (bulk approve, assign route/rep, change status, export, price update) — major time-saver at scale.
- **Architecture impact:** **DFG already ships bulk field-config actions** — generalize to **list rows**: selection state in the standard list + a bulk action bar + server actions that loop with per-row permission/validation + one audit entry. Must respect RLS, status gates, governance.
- **Dependencies:** S1 standard list (selection), permissions, status/governance gates.
- **Complexity:** **M**.
- **Recommended phase:** Phase 1.
- **Class:** **Must-Have.**

## 9. Command Center Dashboard
- **Business value:** Role-tailored home (rep: route/visits/collections; finance: AR aging/overdue; warehouse: low-stock/transfers; management: KPIs) — the product's "face"; drives daily use.
- **Architecture impact:** Per-role dashboard composition (UX-review **S3**); pre-computed/materialized KPI reads (ties to DB Scalability "report summaries"); drill-downs to the standard lists (deep links).
- **Dependencies:** role model, report summaries, deep-link lists (S1).
- **Complexity:** **L**.
- **Recommended phase:** Phase 1–2.
- **Class:** **Must-Have** (role dashboards) / differentiator (KPIs).

## 10. Integration Health Dashboard
- **Business value:** Visibility into API keys, webhooks, sync jobs, ETA e-invoicing status — reduces support load, builds enterprise trust.
- **Architecture impact:** Builds on the **integrations module** (keys/webhooks/sync exist) + webhook delivery logs + job status; a status/last-run/error surface. Mostly read + a retry action.
- **Dependencies:** integrations module, webhook/job logs.
- **Complexity:** **M**.
- **Recommended phase:** Phase 3.
- **Class:** Nice-to-Have (Must-Have once integrations are in commercial use).

## 11. Feature Flags
- **Business value:** Safe gradual rollout, per-company enablement, A/B and beta gating — de-risks releases; enables tiered plans.
- **Architecture impact:** Today, **company `modules`/capabilities already gate** features. Add an explicit flags layer: `erp_feature_flags(scope: platform|company, key, enabled, rollout)` + a resolver (platform default → company override) + a `useFlag()`/server check. Platform-owner managed.
- **Dependencies:** company config, permissions, platform admin.
- **Complexity:** **M**.
- **Recommended phase:** Phase 1 (it de-risks everything after it).
- **Class:** **Must-Have** (operational enabler).

## 12. Impersonation
- **Business value:** Platform support can "view as company/user" to diagnose issues — huge support-efficiency + sales-demo enabler.
- **Architecture impact:** **Security-sensitive.** A scoped, time-boxed, **fully-audited** impersonation session (platform-owner only): assume a target company/user context for RLS while tagging every action as impersonated. Needs careful session handling + an always-on banner + audit of enter/exit and all writes (or read-only mode first).
- **Dependencies:** RLS helpers, audit, platform-owner role; ideally Feature Flags + Universal Timeline.
- **Complexity:** **L** (security review mandatory).
- **Recommended phase:** Phase 2–3.
- **Class:** **Must-Have** for support at commercial scale (read-only first).

## 13. AI Assistant
- **Business value:** Natural-language queries ("overdue customers in Riyadh"), guided actions, and help — strong differentiator and onboarding accelerator.
- **Architecture impact:** **XL.** An LLM layer with **tool/function calls** mapped to existing server actions/RPCs, strictly **RLS- and permission-scoped** (the assistant can only do what the user can). Needs guardrails, cost controls, audit, and careful data-exposure boundaries. Builds naturally on Global Search + the entity registry + DFG (it knows the fields).
- **Dependencies:** Global Search, entity registry, permissions, audit; a model/runtime budget.
- **Complexity:** **XL.**
- **Recommended phase:** Phase 4.
- **Class:** Nice-to-Have (high commercial upside, build last on solid foundations).

## 14. Workflow Designer / Approval Builder
- **Business value:** Each company builds & manages its own approval processes **without code** (customer, credit-limit, price-change, return, visit, data-change, custom) — governance, compliance, and a major enterprise-sales differentiator.
- **Architecture impact:** The **generic workflow engine already exists** (`erp_workflow_definitions/steps/instances/tasks`, RPCs `erp_workflow_start`/`erp_workflow_decide`, approver types company_admin/user/role/**permission**, outcome-handler registry, `/approvals` inbox; seeded `customer_onboarding`/`customer_update`/`credit_limit_approval`). This item is the **no-code builder UI + per-company definitions**: a `/settings/workflows` designer to author a definition = **trigger (entity + event)** → **ordered/parallel steps** (approver type, threshold, SLA/escalation) → **outcome**, scoped per company (company-owned definitions overlaying platform defaults) with activate/deactivate + versioning.
- **Dependencies:** workflow engine (exists), roles/permissions, entity registry, DFG, Approval Requests inbox.
- **Complexity:** **L** (engine done; the work is the builder UX, per-company definition storage, validation, and safe activation/versioning).
- **Recommended phase:** Phase 2.
- **Relationship with Dynamic Field Governance:** **Complementary, not overlapping.** DFG governs **fields** (visibility/editability/required/**sensitive**); the Workflow Designer governs **process** (who approves, in what order). They meet at change-gating: a **DFG-sensitive field change** raises a **change-request** that the Designer's workflow routes for approval (the existing `customer_update` staged-change pattern, generalized). DFG = *what needs approval*; Designer = *how it's approved*.
- **Relationship with Approval Requests module:** Build-time vs run-time. The **Designer authors** definitions; the **`/approvals` inbox executes** the tasks those definitions generate. Same engine; one configures, one acts.
- **Reusability across all entities:** The engine is already generic over `(entity, record_id, context)`. The Designer simply lets a company **bind a workflow to any entity + trigger key** (incl. custom), so one builder serves customer/credit/price/return/visit/data-change/custom with no per-entity code.
- **Class:** **Must-Have** for commercial governance (the pilot runs on the pre-seeded definitions).

## 15. Master Data Import Center
- **Business value:** Fast onboarding **and** ongoing bulk maintenance across master data — the biggest implementation-cost reducer and a common sales objection-remover.
- **Architecture impact:** A unified import pipeline for **Customers, Products, Routes, Salesmen, Prices, Suppliers**:
  - **Upload → Parse** (CSV/Excel) → **Validate** (schema + **DFG required/validation rules** + FK existence + dedupe on `code` + RLS company scope + status/hierarchy guards) → **Preview** (per-row OK/warn/error, mapped columns) → **Import** (batched upsert `onConflict company_id,code`) → **Error reporting** (per-row reasons + downloadable error file) → **Rollback**.
  - New: `erp_import_batches(id, company_id, entity, status, counts, created_by)` + a per-row link / before-image, so a batch can be **undone** (delete inserted, revert updated). Column mappings driven by the **entity registry**; reuses the existing manual-first CSV import as the starting point.
- **Dependencies:** entity registry, **DFG** (validation/required), RLS, existing import flow, governance write-enforcement.
- **Complexity:** **L** (validation + preview + transactional batches + rollback are the substance).
- **Recommended phase:** Phase 1–2 (onboarding-critical; pilot uses the simpler per-entity import that exists today).
- **Class:** **Must-Have** for commercial onboarding (Nice-to-Have for the pilot).
- **Notes:** Rollback is the trickiest piece — recommend **staged import + explicit commit** with a stored before-image per changed row (true undo), and an idempotent re-run on the same batch key.

## 16. Customer Onboarding Wizard
- **Business value:** Guides a brand-new company from **zero setup → go-live** in a single, self-serve flow — slashes implementation time/cost, reduces churn at the riskiest moment (first week), and lets sales demo "live in minutes."
- **Architecture impact:** **Extends the existing onboarding/setup** (`/onboarding` self-service company creation + `/setup` business-type wizard + `setup_done` flag). This is an **orchestration layer** — a resumable multi-step wizard whose steps each link to capabilities that already exist or are on this roadmap:
  1. **Company profile** (name, business_type, currency, VAT/CR) — existing company edit.
  2. **Branch setup** — settings/branches.
  3. **User setup** — settings/users (invite).
  4. **Roles & permissions** — settings/permissions matrix.
  5. **Customers import** — Master Data Import Center (#15).
  6. **Products import** — Import Center (#15).
  7. **Routes setup** — distribution/routes.
  8. **Workflow setup** — Workflow Designer (#14) / activate pre-seeded definitions.
  9. **Feature flags selection** — Feature Flags (#11) per plan/needs.
  10. **Validation checklist** — each step reports done/blocked (uses DFG required rules + counts).
  11. **Go-live readiness score** — a weighted % over the steps (e.g. ≥1 branch, ≥1 admin, customers loaded, products loaded, a sales workflow active, credit policy set) with a clear "what's left" list.
  - Needs lightweight progress state (`erp_onboarding_progress(company_id, step, status, completed_at)` or extend the `setup` flags) + a scoring function; the heavy lifting is reused from each underlying flow.
- **Dependencies:** existing setup wizard; **Import Center (#15)**, **Workflow Designer (#14)**, **Feature Flags (#11)**, roles/permissions, branches/users, DFG (validation). A **v1 can ship with the steps that exist today** (profile/branches/users/roles/customers+products import/routes) and progressively fold in workflow/flags as those land.
- **Complexity:** **L** (orchestration + resumable state + readiness scoring across many flows; each underlying step already exists or is planned).
- **Recommended phase:** Phase 1–2 (after Import Center + Feature Flags; v1 partial in Phase 1).
- **Class:** **Must-Have** for commercial onboarding (the pilot uses the existing `/setup` + getting-started checklist).
- **Relationships:** It is the **front door** that ties together #11 Feature Flags, #14 Workflow Designer, #15 Import Center, the role/permission model, and the dashboard's getting-started checklist — so it should land **after** those foundations (or degrade gracefully to the available steps).

## 17. Subscription & Billing Platform
- **Business value:** The commercialization engine — turns the platform into a sellable SaaS: trials, paid plans, entitlements, limits, dunning, and self-serve upgrades. Directly enables revenue.
- **Architecture impact:** **A subscription foundation already exists** (`0020_subscriptions`, the `billing` i18n module, `/upgrade`, platform billing, `business_type` on companies). This item formalizes/extends it into a full model:
  - **Trial management:** trial start/end + grace window; auto-convert or expire → suspension.
  - **Subscription plans:** plan catalog (tier, price, interval, limits) + per-company subscription record.
  - **Feature entitlements:** plan → the set of enabled capabilities + quotas (**resolved into Feature Flags**, see below).
  - **User limits:** max seats per plan, enforced at invite/activation.
  - **Storage limits:** attachment-storage quota per plan, enforced at upload (ties to the Attachments module, #79/0111).
  - **Usage tracking:** metered counters (active users, storage bytes, transactions, customers) for limit checks + analytics — a `erp_usage_counters` rollup.
  - **Billing status:** `trial | active | past_due | suspended | cancelled` on the company; resolved in the app shell.
  - **Suspension rules:** past-due / trial-expired → graduated degradation (read-only → block new business → block login), with a collections-style grace period — reuses the existing `/upgrade` redirect pattern.
  - **Upgrade / downgrade workflows:** plan change with proration, **entitlement re-resolution**, and **downgrade guards** (can't drop below current usage — e.g. seats/storage in use).
  - **Payment provider** integration (Stripe or local gateway) is an **external dependency** (webhooks → billing status); invoices/receipts + dunning emails.
- **Relationship with Feature Flags (#11):** **Tightly coupled, clean separation.** The **plan/entitlements define _what_ a company is entitled to**; **Feature Flags are the _runtime enforcement_ layer** that reads those entitlements (plan default → company override → platform override). One resolver: `entitlement(company, key) → enabled + limit`. Billing sets entitlements; Flags gate the UI/actions; Usage tracking enforces the numeric limits. Building **Feature Flags first** (Phase 1) means Billing slots in as the entitlement source with no re-plumbing.
- **Dependencies:** **Feature Flags (#11)** (enforcement), Attachments (storage metering), Users (seat limits), platform admin, audit, external payment provider.
- **Complexity:** **XL** (plans + proration + metering + dunning + provider integration + suspension UX).
- **Recommended phase:** Phase 3 (commercialization — after the pilot proves the product and Feature Flags + core capabilities are in place).
- **Class:** **Must-Have for commercialization** (not needed for the pilot, which runs on the existing trial/subscription scaffolding).

---

## Summary

| # | Capability | Complexity | Class | Phase | Reuses |
|---|---|:--:|---|:--:|---|
| 6 | Quick Actions | S | Must | 0 | create flows, nav |
| 2 | Saved Views | S | Nice | 1 | S1 URL state |
| 1 | Global Search | M | Must | 1 | ⌘K palette, S1 search |
| 3 | Notification Center | M | Must | 1 | erp_notifications |
| 8 | Bulk Actions | M | Must | 1 | DFG bulk, S1 lists |
| 11 | Feature Flags | M | Must | 1 | modules/config |
| 9 | Command Center Dashboard | L | Must | 1–2 | roles, report summaries |
| 4 | Universal Timeline | M | Nice | 2 | audit, attachments, notes |
| 5 | Data Quality Dashboard | M | Nice | 2 | DFG required, indexes |
| 7 | Favorites | S | Nice | 2 | nav, saved-views storage |
| 12 | Impersonation | L | Must* | 2–3 | RLS, audit, platform |
| 10 | Integration Health | M | Nice | 3 | integrations module |
| 15 | Master Data Import Center | L | Must* | 1–2 | entity registry, DFG, existing import |
| 14 | Workflow Designer / Approval Builder | L | Must* | 2 | workflow engine, DFG, approvals inbox |
| 16 | Customer Onboarding Wizard | L | Must* | 1–2 | setup wizard, #11/#14/#15, roles |
| 17 | Subscription & Billing Platform | XL | Must* | 3 | #11 Feature Flags, attachments, users, payment provider |
| 13 | AI Assistant | XL | Nice | 4 | global search, registry, perms |

\* Must-Have for commercial onboarding/governance; the pilot runs on the existing `/setup`, per-entity import and pre-seeded workflows.

\* Must-Have for commercial-scale support; read-only first.

## 18. User Access Overrides (UAO)
- **Status:** ✅ **Implemented · Validated · Activated · Production Ready** (platform-wide). Shipped on branch `claude/pilot-ux` (PR #319); migration `0346` applied to `vantora-staging`; flag ON + all companies entitled.
- **Business value:** Company Admins self-serve per-user **operational** permission grant/revoke (the 6-permission operational seed) on top of role baselines — without platform involvement, fully audited.
- **Architecture:** Generalizes the existing `erp_temporary_access_grants` engine (additive, backward-compatible) with `effect` + `kind` columns and a permanent-override path. Resolver Block 2 in `getUserContext` applies grants/revokes, re-validated against the delegable allowlist every resolve.
- **Guardrails:** delegable allowlist (`erp_delegable_permissions`) + immutable deny-list (`erp_is_delegable_permission`); admin-gated writes via RLS `WITH CHECK`; mandatory reason (DB CHECK); full audit (`erp_audit_logs`); effective-permissions diff. Operational seed only — **no** approval/treasury/security/platform/RLS/system permissions.
- **Activation model:** **Global flag `KAKO_USER_ACCESS_OVERRIDES` AND per-company entitlement** (`platform.user_access_overrides`). Platform-wide = flag ON + all companies entitled. Preserves a global kill-switch and per-company disable.
- **Complexity:** delivered (≈ M, default-OFF through E0–E4).
- **Class:** **Must-Have** (governance).

## 19. Role Permission Overrides (Bulk Role Overrides)
- **Status:** 📐 **Design approved — not built** (next authorization enhancement after UAO).
- **Business value:** Company Admins grant/revoke delegable **operational** permissions for an entire **role** at once (e.g. all Salesmen + `customer.request`), without editing users individually.
- **Architecture:** Reuses the UAO engine — extends `erp_temporary_access_grants` with `role_key` + `kind='role_override'` (no new engine, no duplicate tables). Resolution order: **base role perms → role overrides → user overrides → effective**, so **user-level overrides always win** over role-level.
- **Reuse:** delegable allowlist, immutable deny-list (`erp_is_delegable_permission`), admin-gated RLS, `applyAccessOverrides`/diff pure logic, audit, entitlement engine, grouping helper — all reused. New: `role_key` column, one `kind` value, a resolver block, role-scoped actions, and a Role Overrides page.
- **Guardrails:** default OFF · flag `KAKO_ROLE_PERMISSION_OVERRIDES` AND entitlement `platform.role_permission_overrides` · global kill-switch · per-company disable · mandatory reason · full audit · RLS. No approval/treasury/security/platform/RLS/super-admin permissions.
- **Effort:** ≈ 6–7 engineer-days (reuse-heavy). **Complexity:** **M**.
- **Class:** **Must-Have** (governance). See design doc `docs/audits/ROLE-PERMISSION-OVERRIDES-DESIGN.md`.

## Recommended execution order (maximize pilot readiness → commercial value)
1. **Phase 0 — fold into current hardening:** **Quick Actions** + **Saved Views** (cheap, ride on S1; immediate daily-speed wins for the pilot).
2. **Phase 1 — pre-commercial core:** **Feature Flags** (first — de-risks every later rollout) → **Global Search** → **Notification Center** → **Bulk Actions** → **Master Data Import Center** (onboarding) → start **Command Center (role dashboards)**.
3. **Phase 2 — trust & differentiation:** finish **Command Center KPIs**, **Workflow Designer / Approval Builder**, **Customer Onboarding Wizard** (full — ties #11/#14/#15 together), **Universal Timeline**, **Data Quality Dashboard**, **Favorites**, **Impersonation (read-only)**.
   *(Onboarding Wizard v1 — the steps that exist today — can ship in Phase 1 alongside the Import Center.)*
4. **Phase 3 — commercialization & operations at scale:** **Subscription & Billing Platform** (entitlements built on the Phase-1 Feature Flags), **Integration Health Dashboard**, full **Impersonation**.
5. **Phase 4 — flagship differentiator:** **AI Assistant** (on top of Global Search + registry + permissions).

**Rationale:** ship the cheap daily-speed wins now (pilot feel), then the commercial-table-stakes (search, notifications, bulk, role dashboards) with **Feature Flags first** so each capability can roll out safely per company; defer the heavy/sensitive (Impersonation, Integration Health) and the flagship (AI) until the foundations and the load-testing/scalability items are in place.

---

*Roadmap & architecture review only — no code, no merge, no production migrations.*
