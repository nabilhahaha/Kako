# VANTORA — Implementation Backlog

> **Method.** The VANTORA Constitution v1 is the source of truth. This backlog classifies the
> **current repository** (`kako-fmcg`, audited via `VANTORA_MASTER_AUDIT.md`) against it as
> **EXISTS / PARTIAL / MISSING**. Evidence cites real files/tables/RPCs. Status legend is the
> repository's state, not the Constitution's intent. Priorities follow the Constitution's
> Article 46 ordering, adjusted to current gaps. This is an execution plan, not a redesign.

Legend: **EXISTS** = implemented & in use · **PARTIAL** = present but incomplete vs Constitution ·
**MISSING** = not in the repo. Priorities: **P0** blocks core GA · **P1** near-term · **P2**
later · **P3** future/reserved.

---

## 1. BACKBONE (Book 3 / Book 5)

### Platform OS — Art. 13
- **Current Status:** PARTIAL
- **Evidence:** `platform/` module (companies 13 actions, plans 7, billing 4, roles 6, staff 4); `erp_companies`, `erp_plans`, `erp_plan_modules`, `erp_company_modules`, `erp_business_type_modules`; feature-flag helpers `src/lib/sync/flag.ts`; multi-edition `src/lib/edition/`.
- **Gap:** No self-serve subscription lifecycle/metering UI; marketplace control absent; feature-flag engine is env-based, not the Constitution's per-company pilot/rollout engine.
- **Priority:** P1 · **Dependencies:** Security OS, Billing, Marketplace OS · **Next action:** build a company-scoped feature-flag/rollout table + screen; formalize subscription/metering on `erp_plans`.

### Security OS — Art. 14
- **Current Status:** PARTIAL
- **Evidence:** `getUserContext`/`guards.ts`/`permissions.ts`; RLS on 121+ tables; helpers `erp_user_company_id`, `erp_has_branch_access`, `erp_is_super_admin`; impersonation hardening `src/lib/sync/server/impersonate.ts` (this PR).
- **Gap:** MFA, SSO/AD/Azure, device governance, session-security dashboard, brute-force/rate-limit on auth — _Unverified/likely missing_.
- **Priority:** P1 · **Dependencies:** Platform OS, Audit · **Next action:** add MFA + session/device tables + security dashboard; auth rate-limit review.

### Master Data OS — Art. 15
- **Current Status:** PARTIAL
- **Evidence:** `erp_customers`(+lookups/attributes/opening_balances), `erp_products_catalog`(+categories/uoms), `erp_suppliers`, `erp_warehouses`; import engine `src/lib/erp/import-*.ts`; custom fields `src/lib/erp/custom-fields*.ts`; numbering `erp_next_number`.
- **Gap:** **Employee, Asset, Vehicle masters MISSING** (no `erp_employees`/`erp_assets`/`erp_vehicles`); Data Quality Engine (dedupe/health score) not surfaced.
- **Priority:** P0 (customer/product/supplier) EXISTS; employee/asset/vehicle **P1** · **Dependencies:** Platform, Security · **Next action:** add Employee/Asset/Vehicle master entities before HR/Asset OS.

### Workflow OS — Art. 32
- **Current Status:** PARTIAL
- **Evidence:** `src/lib/erp/workflow-handlers.ts`, `settings/workflows/**`, `erp_workflow_instances`, `approvals`/`approval-center` modules.
- **Gap:** Only ~3 entity handlers (customer onboarding/change/credit); **no visual workflow builder, rule/SLA/escalation engine, workflow marketplace**.
- **Priority:** **P0** (Constitution Art. 46) · **Dependencies:** Platform, Notification, Analytics · **Next action:** build generic trigger→condition→action engine + builder UI + SLA/escalation tables.

### Analytics OS — Art. 33
- **Current Status:** PARTIAL
- **Evidence:** per-entity report screens (`reports`, `distribution/*`, `fashion/analytics`, `clinic/reports`); Recharts.
- **Gap:** **No unified KPI engine, report builder, forecast engine, or dashboard registry**; analytics logic is per-module.
- **Priority:** **P0** · **Dependencies:** all OS · **Next action:** introduce a KPI/report registry + builder; route module metrics through it.

### SmartSync — Art. 34
- **Current Status:** EXISTS (flag-gated, validated; not yet in prod)
- **Evidence:** `src/lib/sync/**` (engine, outbox, reconcile, reconcile-deps, impersonate); routes `/api/sync/*`; operator console `settings/sync`; proposed migrations `0001–0005`; branch-validated this session.
- **Gap:** Real-browser pass with flag on; prod migration apply; **offline binary/photo outbox**; reconcile handlers for visits/surveys (orders+customers done).
- **Priority:** **P0** (to enable) · **Dependencies:** Security, Platform, Master Data · **Next action:** run `PILOT_CUTOVER_CHECKLIST.md`; build blob outbox.

### Notification OS — Art. 16
- **Current Status:** PARTIAL
- **Evidence:** `erp_notifications`, `notifications` module (2 actions).
- **Gap:** No multi-channel engine (SMS/WhatsApp/email/push), templates, queue, delivery reports.
- **Priority:** P1 · **Dependencies:** Workflow, Security · **Next action:** add channel adapters + template/queue tables + delivery tracking.

### Search OS — Art. 17
- **Current Status:** MISSING (per-module search only)
- **Evidence:** list screens have local search/filter; no global search service found.
- **Gap:** Permission-aware global search + index governance.
- **Priority:** P2 · **Dependencies:** Security, Master Data, Document · **Next action:** add a global search index respecting RLS.

### Document Management OS — Art. 18
- **Current Status:** PARTIAL
- **Evidence:** `erp_attachments`, `src/lib/erp/attachments.ts`, `components/shared/attachments.tsx`.
- **Gap:** No versioning, document workflow, OCR, expiry tracking, document dashboard.
- **Priority:** P2 · **Dependencies:** Security, Workflow, Search · **Next action:** extend attachments into a versioned Document OS.

### Backup & Recovery OS — Art. 19
- **Current Status:** PARTIAL
- **Evidence:** `erp_backups`, `settings/backup` (6 actions), `scripts/backup.sh`/`restore.sh`, `.github/workflows/backup.yml`, offline `scripts/offline/{backup,restore,rollback}.mjs`.
- **Gap:** Point-in-time/config restore UX, DR (RTO/RPO) dashboard, restore-test compliance.
- **Priority:** P2 · **Dependencies:** Platform, Security, Document, SmartSync · **Next action:** add restore console + DR metrics.

### Localization OS — Art. 20
- **Current Status:** PARTIAL
- **Evidence:** 61 i18n modules (ar/en, RTL), EGP currency, ETA plumbing `src/lib/eta/**`, `settings/einvoice`.
- **Gap:** ZATCA, multi-currency/exchange, country packs beyond Egypt, multi-tax engine config UI.
- **Priority:** P2 · **Dependencies:** Finance, Integration, Platform · **Next action:** generalize tax engine + add currency/exchange.

### Developer & Extension OS — Art. 21
- **Current Status:** PARTIAL
- **Evidence:** `/api/v1/[entity]` (API keys `vtk_live_`, scopes, rate limit), `erp_api_keys`, `settings/integrations/api-keys`, webhooks `erp_webhooks`.
- **Gap:** SDK, developer portal, extension review/publish flow, GraphQL.
- **Priority:** P3 · **Dependencies:** Security, Integration, Marketplace · **Next action:** developer portal + webhook subscriptions UI.

---

## 2. BUSINESS OPERATING SYSTEMS (Book 6)

### CRM OS — Art. 22
- **Status:** EXISTS (PARTIAL vs Constitution) · **Evidence:** `customers` module (360, statements, credit requests; 8 actions), `erp_customers`, `erp_customer_change_requests`. · **Gap:** leads/opportunities, health-score engine, contact roles depth, segmentation UI. · **Priority:** P1 · **Dependencies:** Master Data, Workflow, Analytics, SmartSync · **Next:** add lead/opportunity + health-score model.

### Commercial OS — Art. 23
- **Status:** EXISTS · **Evidence:** `sales` (invoices/orders/returns/pricing/POS/settlement), `wholesale`, `market`, `fmcg` (pricing/targets/returns); `erp_invoices`/`_lines`/`_payments`/`erp_sales_orders`/`erp_sales_returns`; trade-spend `ts_*`. · **Gap:** quotations, unified trade-spend UI (ts_* usage _Unverified_), promotion engine depth. · **Priority:** P1 · **Dependencies:** CRM, Finance, Inventory · **Next:** quotations + trade-spend console.

### Inventory OS — Art. 24
- **Status:** EXISTS · **Evidence:** `inventory` (10 screens), `erp_inventory_stock`, `erp_stock_movements`, counts/transfers/adjustments/van-reconciliation; fashion variants. · **Gap:** bin locations, lot/serial uniform across non-fashion, replenishment automation. · **Priority:** P2 · **Dependencies:** Master Data, Commercial, Procurement, Finance · **Next:** replenishment rules + lot/serial generalization.

### Finance OS — Art. 25
- **Status:** PARTIAL · **Evidence:** `accounting` (journal/vouchers/aging/chart/reports), `erp_journal_entries`/`_lines`, `erp_chart_of_accounts`, `erp_fiscal_periods`; auto journal triggers; `erp_void_invoice`. · **Gap:** **manual GL entry, period close UX, financial statements engine (P&L/BS/CF), budgeting, AP depth, bank reconciliation.** · **Priority:** **P0** · **Dependencies:** Commercial, Procurement, Inventory, Analytics, Localization · **Next:** build manual journal + statements + period close.

### HR & People OS — Art. 26
- **Status:** MISSING · **Evidence:** only `erp_profiles` + `erp_user_branches`; no `erp_employees`/attendance/payroll tables or HR module. · **Gap:** entire OS (Employee 360, attendance, leave, payroll, performance, recruitment, training). · **Priority:** P1 · **Dependencies:** Master Data (Employee), Workflow, Finance, Asset, Analytics · **Next:** Employee master → attendance → payroll.

### Procurement OS — Art. 27
- **Status:** PARTIAL · **Evidence:** `purchases` (orders/returns), `erp_purchase_orders`/`_lines`, `erp_goods_receipts`, `erp_supplier_payments`, `suppliers`. · **Gap:** purchase requests, **RFQ/quote comparison**, vendor evaluation, contracts, 3-way match. · **Priority:** P1 · **Dependencies:** Master Data, Inventory, Finance, Workflow · **Next:** PR→RFQ→comparison flow.

### Asset & Fleet OS — Art. 28
- **Status:** MISSING · **Evidence:** none (no `erp_assets`/`erp_vehicles`/maintenance tables). · **Gap:** entire OS. · **Priority:** P1 · **Dependencies:** HR, Finance, Procurement, Workflow · **Next:** Asset/Vehicle master + assignment + maintenance.

### Service OS — Art. 29
- **Status:** MISSING (generic) · **Evidence:** no generic ticket/case system; vertical "tickets" exist in salon/laundry only. · **Gap:** tickets, SLA, escalation, knowledge base. · **Priority:** P2 · **Dependencies:** CRM, Workflow, Notification, Analytics · **Next:** generic ticket/SLA engine.

### Projects OS — Art. 30
- **Status:** MISSING · **Evidence:** none. · **Gap:** entire OS. · **Priority:** P2 · **Dependencies:** HR, Finance, Asset, Workflow · **Next:** projects/tasks/milestones/timesheets.

### Governance & Compliance OS — Art. 31
- **Status:** MISSING (audit primitives only) · **Evidence:** `erp_audit_logs`/`public.audit_logs`; no policy/risk/internal-audit module. · **Gap:** policy/risk register, internal audit, compliance dashboards. · **Priority:** P2 · **Dependencies:** Document, Workflow, Security, Analytics · **Next:** risk register + policy center.

---

## 3. ENTERPRISE OPERATING SYSTEMS (Book 7)

### Integration OS — Art. 35
- **Status:** EXISTS · **Evidence:** `src/lib/erp/connectors/**` (generic_rest, csv_sftp, dynamics_bc, sap_s4, odoo, netsuite), `/api/internal/sync-tick`, `erp_sync_jobs`/`erp_sync_runs`, `erp_integrations`, `erp_webhooks`. · **Gap:** event-bus pattern, connector health dashboard depth, replay UI. · **Priority:** P2 · **Dependencies:** Security, Platform, Notification, Analytics · **Next:** event monitor + replay console.

### AI OS — Art. 36
- **Status:** PARTIAL · **Evidence:** `copilot` module (9 actions), `erp_copilot_queries`, next-best-actions feeding attention/approval-center; `platform/copilot-analytics`. · **Gap:** forecast/recommendation engines, explainability/audit, AI governance screen. · **Priority:** P3 · **Dependencies:** Analytics, Security, Master Data, Workflow · **Next:** formalize AI insight registry + governance.

### Marketplace OS — Art. 37
- **Status:** PARTIAL · **Evidence:** entitlement plumbing (`erp_plan_modules`/`erp_company_modules`), `settings/marketplace`. · **Gap:** install/configure/upgrade lifecycle, publisher console, dependency rules. · **Priority:** P3 · **Dependencies:** Platform, Security, Billing, Developer OS · **Next:** package manifest + install lifecycle.

---

## 4. INDUSTRY PACKS (Book 8)

| Pack | Status | Evidence | Gap | Priority |
|---|---|---|---|---|
| FMCG Distribution | EXISTS | `field`, `distribution`(15), `fmcg`(22 actions), visits/GPS/van/MSL/grading | aggregated BI; offline photos | P0 (flagship) |
| Wholesale | EXISTS | `wholesale` (tiers/prices/order) | — | P0 |
| Retail POS | EXISTS | `market/pos` | shift/cash-up, loyalty | P0 |
| Fashion | EXISTS | `fashion` (variants/installments/cashbox) | — | P1 |
| Pharmacy | EXISTS | `pharmacy/dispense` | insurance/Rx pricing | P1 |
| Clinic | EXISTS | `clinic` (patients/appointments/visits) | billing/insurance | P1 |
| Restaurant | EXISTS | `restaurant` (tables/kitchen/orders) | split payments _(Unverified)_ | P1 |
| Laundry | EXISTS | `laundry` (orders/services) | logistics | P2 |
| Hotel | PARTIAL | `hotel` (rooms/bookings) | billing/checkout/housekeeping | P2 |
| Salon | PARTIAL | `salon` (appointments/tickets) | payments flow | P2 |
| Electrical/RMA | PARTIAL | `electrical` (rma/serials/warranties) | order/invoice integration | P2 |
| Workshop | MISSING | — | entire pack | P2 |
| Manufacturing/Construction/Facility/RealEstate/Education/Logistics/Gym/CarRental/Government/NGO | MISSING | — | reserved packs | P3 |

---

## 5. CROSS-CUTTING (Book 9 / Book 10)

- **Permission model — EXISTS/PARTIAL:** ~76 permissions, 20 roles, plan→module gating, RLS scopes (`permissions.ts`, `guards.ts`). **Gap:** Constitution's full **Role × Screen × Action × Scope** matrix + **Role Designer** UI with field/record access + "preview as role". **P1.**
- **Screens — PARTIAL:** core screens follow header/list/profile patterns but not uniformly the Universal Screen Standard (timeline/AI-insights/comments tabs). **P2.** (See `SCREEN_ARCHITECTURE.md`.)
- **Database — PARTIAL:** ~157 tables; mandatory-field standard mostly followed; **two audit-log tables (debt)**; missing employee/asset/vehicle/project/ticket tables. **P0/P1.** (See `DATABASE_BLUEPRINT.md`.)
- **API — PARTIAL:** small REST surface + server actions; versioning/owner/rate-limit declared only on `/api/v1`. **Gap:** API governance metadata across actions. **P2.**
- **Events — MISSING:** no platform event bus (Art. 43); actions call effects directly. **P1** (prerequisite for Workflow/Analytics/AI/Integration maturity).
- **Universal Engines (Art. 12) — MIXED:** Import/Export/Numbering/Attachment EXISTS; Approval/Workflow/Notification/Audit PARTIAL; Search/AI/Timeline/Reporting PARTIAL/MISSING.

---

## 6. PRIORITY ROLLUP

- **P0 (blocks core GA):** Finance OS (manual GL/statements/period-close) · Workflow OS engine+builder · Analytics OS unified engine · SmartSync prod cutover · audit-log consolidation.
- **P1:** HR/People OS · Procurement (RFQ/vendor) · Asset & Fleet OS · Master Data employee/asset/vehicle · Event bus · Notification OS · Role Designer · Security (MFA/sessions).
- **P2:** Service OS · Document OS · Governance OS · Projects OS · Search OS · Localization (ZATCA/multi-currency) · Backup/restore UX · finish hotel/salon/electrical · Integration event monitor.
- **P3:** AI OS · Marketplace OS · Developer OS/SDK · reserved industry packs · reserved architecture (WMS/TMS/Manufacturing/E-Com/IoT/DW/ML/White-label).
