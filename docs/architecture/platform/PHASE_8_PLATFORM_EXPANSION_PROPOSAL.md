# VANTORA — Phase 8: Platform Expansion & Enterprise Self-Service (Architecture Proposal)

**Status:** 🔵 **Design review / proposal + roadmap only — NO implementation, NO migrations, NO code.**
Phase 8 begins **after Phase 7 completes** and must not interrupt it. Every capability is platform-wide,
multi-tenant, RLS-scoped, governance/role-template/approval-authority/field-governance/audit-aware, and
country-/industry-pack compatible. **Reuse-first** is the headline: a large share of Phase 8 *formalizes
no-code surfaces over engines that already exist*.

---

## Reuse baseline (what already exists — do NOT rebuild)
| Existing capability | Reused by |
|---|---|
| **Workflow engine** (0088–0090, 0176–0184) + builder canvas (React Flow, `/settings/workflows`) + tasks/runtime/dispatch/SLA tick | 8A, 8E, 8F, 8J |
| **Approval authority** (0227), **role governance / data scope / field governance** (0114–0117, 0227), **role templates + versioning** (0226) | 8A, 8C, 8D, 8B |
| **Read-models + KPI/StatCard + scorecard/perfect-store pillars** + `erp_rep_day_kpis` snapshots | 8B, 8C, 8G |
| **Raw-data export** (`attribution/toRawDataRows`), **entity registry**, **search** (KAKO_SEARCH) | 8C, 8B |
| **Determination/rule patterns** — tax determination (0200), commission rules (0218), pricing rules (0221), MDG (0225) | 8D |
| **`erp_notifications`** + workflow tasks; integration webhooks | 8E |
| **Surveys** (0144) + **custom fields** (0087) + field governance (0114) + attachments (0111) + GPS (0131) | 8F |
| **Copilot queries** (0135) + attribution `explain` + ownership + commercial engines | 8G |
| **Van warehouses + GPS + route costing** (van-accounting 0229), territories (0215) | 8H |
| **Attachments + GPS + audit + merchandising** (retail execution 0144) | 8I |
| **Purchasing** (Phase 2: PO, suppliers, AP 0190/0191) + workflow + approval authority | 8J |

---

## Per-capability proposals

### 8A — Workflow Builder
- **Reuse:** ~70% exists (workflow engine + canvas + tasks + SLA + dispatch). **Net-new:** a no-code
  approval-template library (Customer/Price/Trade-Spend/Return/Collection/Purchase/Credit/Data-Update),
  conditional logic UI, multi-level + escalation + delegation config, draft/publish + reusable templates
  (versioning pattern from 0226/0117). **Data model:** `erp_workflow_templates` + delegation/escalation
  config (additive). **Security:** approval-authority (0227) gates who can act; audit via workflow logs.
  **Scalability:** event-driven (existing partial-index dispatch). **UI:** extend the canvas + a template
  gallery. **Mobile:** approve/delegate from the mobile inbox (offline-aware via 7B).

### 8B — Dashboard Builder
- **Reuse:** read-models + KPI/StatCard + saved-view + filter patterns; **the Drag-and-Drop Framework
  (backlog) is a prerequisite for layout editing.** **Net-new:** widget registry, role-based dashboard
  defs, saved layouts, chart/map/table widgets, mobile layouts, templates. **Data model:**
  `erp_dashboards` + `erp_dashboard_widgets` (+ role binding). **Security:** widgets honor data-scope +
  Entity-360 section security (0227). **Scalability:** widgets bind to *snapshot* read-models, not live
  scans. **UI/Mobile:** drag-drop desktop; responsive widget stacking on mobile.

### 8C — Report Builder
- **Reuse:** raw-data exports + entity registry + field governance (column security) + scheduling cron
  pattern (kpi-snapshot). **Net-new:** report designer (columns/calculated fields/grouping/filtering),
  schedule + email delivery, Excel/PDF export, saved reports + templates. **Data model:**
  `erp_report_definitions` + `erp_report_schedules`. **Security:** field-governance restricts columns;
  exports honor data-scope (review M-finding from prod-readiness). **Scalability:** scheduled async
  generation; bounded result sets. **UI:** designer; **Mobile:** view/share only.

### 8D — Rule Engine
- **Reuse:** the determination-rule pattern is already implemented four times (tax/commission/pricing/MDG)
  — 8D **generalizes** it into one configurable engine. **Net-new:** visual rule builder (conditions →
  actions, priorities, effective dates, **simulation mode**, versioning). **Data model:** `erp_rules` +
  `erp_rule_conditions` + `erp_rule_actions` (effective-dated, versioned). **Security:** rules are
  company-scoped config; changes audited + MDG-governed. **Scalability:** pure evaluation engine (like
  the existing pure resolvers). **UI:** rule builder + a dry-run simulator. **Mobile:** n/a (admin).

### 8E — Notification Center
- **Reuse:** `erp_notifications` + workflow escalations + retention (0119). **Net-new:** templates,
  channel adapters (in-app live; email; SMS; WhatsApp/push future), delivery tracking, user preferences,
  rules/escalations. **Data model:** `erp_notification_templates` + `erp_notification_deliveries`
  (+ `erp_user_notification_prefs`). **Security:** company-scoped; channel secrets via Vault. **Scalability:**
  queue + retry (reuse the sync-engine retry pattern recommendation). **UI:** in-app center + prefs;
  **Mobile:** push (PWA) over the 7B foundation.

### 8F — Form Builder
- **Reuse:** surveys (0144) + custom fields (0087) + field governance + attachments + GPS + **workflow
  integration (8A)**. **Net-new:** dynamic sections + conditional visibility + signatures + approval/
  workflow binding. **Data model:** generalize `erp_surveys` → `erp_forms` + `erp_form_sections` +
  `erp_form_fields` + responses (or extend surveys). **Security:** field governance + data scope. **UI:**
  form designer; **Mobile:** form execution offline (7B) with GPS/photos/signature.

### 8G — AI Insights Layer
- **Reuse:** copilot queries (0135), attribution `explain`/traceability, commercial forecasting/
  profitability, customer-timeline/health, ownership. **Net-new:** an explainable insight layer
  ("why did sales drop / which customers at risk / route underperformance / trade-spend effectiveness /
  forecast explanation / collection risk") over the existing read-models, with strict **role-based access +
  data-scope isolation + auditability + business-context grounding** (no cross-tenant leakage; answers
  cite the read-models). **Data model:** `erp_insight_runs` (audit) — mostly compute over existing data.
  **Security:** highest scrutiny — every query RLS-scoped + audited; no raw LLM access to other tenants'
  data. **Scalability:** async, cached insights. **UI:** insight cards + Q&A; **Mobile:** read-only cards.

### 8H — Fleet Management (industry pack)
- **Reuse:** van warehouses + GPS + route costing (0229) + territories. **Net-new:** vehicles, drivers,
  maintenance, fuel, GPS tracking, route costing, utilization, accidents. **Data model:** `erp_vehicles`,
  `erp_drivers`, `erp_vehicle_maintenance`, `erp_fuel_logs`, `erp_vehicle_assignments`. **Security:**
  company-scoped. **UI:** fleet console; **Mobile:** driver app (fuel/odometer/incident capture via 7B).

### 8I — Asset Management (industry pack)
- **Reuse:** attachments + GPS + audit + merchandising/retail-execution (0144). **Net-new:** asset
  lifecycle, assignment, customer allocation (freezers/displays/POS at outlets), maintenance, ownership,
  GPS. **Data model:** `erp_assets`, `erp_asset_assignments`, `erp_asset_maintenance`, `erp_asset_movements`.
  **Security:** company-scoped; customer-deployed assets tie to `erp_customers`. **Mobile:** field asset
  audit (photo/GPS/QR) via 7B.

### 8J — Procurement Pack (industry pack)
- **Reuse:** purchasing (Phase 2: PO/suppliers/AP) + workflow (8A) + approval authority. **Net-new:**
  RFQ, vendor evaluation, contracts, receiving enhancements, procurement analytics. **Data model:**
  `erp_rfqs` + `erp_rfq_lines` + `erp_vendor_evaluations` + `erp_contracts`. **Security:** company-scoped;
  approval-authority thresholds. **UI:** procurement console; **Mobile:** approve only.

---

## Deliverable — scored summary
**Business value (BV) / Complexity (CX): 1 (low) – 5 (high). Effort: S/M/L/XL.**

| Cap | Recommended order | BV | CX | Effort | Key dependencies | Reuse % | Core vs Pack |
|---|---|---|---|---|---|---|---|
| **8A Workflow Builder** | 1 | 5 | 3 | M | workflow engine (exists), approval authority | ~70% | **Core** |
| **8E Notification Center** | 2 | 5 | 2 | M | erp_notifications, workflow, 7B push | ~60% | **Core** |
| **8D Rule Engine** | 3 | 5 | 3 | M | tax/commission/pricing/MDG rule patterns | ~65% | **Core** |
| **8F Form Builder** | 4 | 4 | 3 | M | surveys, custom fields, 8A, 7B | ~70% | **Core** |
| **8C Report Builder** | 5 | 4 | 3 | M-L | raw-data export, field governance, scheduling | ~55% | **Core** |
| **8B Dashboard Builder** | 6 | 4 | 4 | L | **Drag-Drop Framework (backlog)**, read-models | ~50% | **Core** |
| **8G AI Insights** | 7 | 5 | 4 | L | copilot, attribution, forecasting; security-heavy | ~50% | **Core (premium)** |
| **8J Procurement Pack** | 8 | 3 | 3 | M-L | purchasing (Phase 2), 8A | ~50% | **Pack** |
| **8I Asset Management** | 9 | 3 | 3 | M | attachments/GPS, merchandising, 7B | ~40% | **Pack** |
| **8H Fleet Management** | 10 | 3 | 4 | L | van/GPS/route costing (0229), 7B, telematics | ~40% | **Pack** |

### Recommended implementation order (rationale)
**8A → 8E → 8D → 8F → 8C → 8B → 8G → 8J → 8I → 8H.**
No-code **Workflow Builder (8A)** unlocks approvals everywhere and is mostly built; **Notification Center
(8E)** and **Rule Engine (8D)** are high-value, high-reuse platform primitives that 8A/8F/8C build on;
**Form Builder (8F)** + **Report Builder (8C)** + **Dashboard Builder (8B)** are the self-service trio (8B
depends on the backlogged Drag-Drop Framework); **AI Insights (8G)** sits atop all the read-models (and
needs the most security rigor); the three **industry packs (8J/8I/8H)** ship last as optional, plan-gated
packs.

### Core platform vs optional packs
- **Core (every tenant):** 8A Workflow Builder · 8E Notification Center · 8D Rule Engine · 8F Form Builder ·
  8C Report Builder · 8B Dashboard Builder · 8G AI Insights (premium tier).
- **Optional packs (plan/industry-gated, marketplace-style):** 8J Procurement · 8I Asset Management ·
  8H Fleet Management.

### Cross-cutting risks
- **8B depends on the Drag-and-Drop Framework** (currently post-Phase-7 backlog) — sequence accordingly.
- **8G AI Insights** carries the highest security/isolation risk — must enforce RLS + data-scope + audit on
  every query and never expose cross-tenant data to the model.
- **Self-service power → governance load:** all builders (8A/8B/8C/8D/8F) must route changes through
  versioning + audit + approval, reusing 0226/0227/MDG so tenant admins can't silently alter controls.

## Platform-requirement compliance
Every proposal: reuse-first · multi-tenant + RLS · governance/role-template/approval-authority/field-
governance/audit-aware · additive-only migrations · flags default OFF · country-/industry-pack compatible.

*Design review only. On approval, each sub-phase proceeds engine-first → additive flagged migrations →
gateway → integration tests before merge, in the recommended order. Phase 8 starts after Phase 7.*
