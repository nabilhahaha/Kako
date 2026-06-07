# VANTORA — Screen Architecture

> **Method.** Screen trees for every OS in the Constitution (Books 5–8, Appendix B). Each screen
> lists: **Purpose · Tabs · Actions · Permissions · Workflows · Reports/KPIs · SmartSync**.
> A status tag shows the repository's current state: **[EXISTS]** (screen present),
> **[PARTIAL]** (present but missing Constitution elements), **[MISSING]** (to build). Permission
> keys reference `src/lib/erp/permissions.ts` where they exist. This documents the target per the
> Constitution and maps current reality against it — it does not redesign anything.

**Universal Screen Standard (Art. 08, applies to every Profile screen):** Header · Actions ·
Tabs(Overview/Transactions/Documents/Analytics/Audit/Settings) · Timeline · Attachments ·
Comments · Analytics · Audit · AI Insights. **SmartSync legend:** OFFLINE-FIRST / HYBRID /
ONLINE-ONLY (Art. 34 — every screen must declare one).

---

## PLATFORM CORE OS

### Platform OS [PARTIAL]
- **Platform Owner Dashboard** [EXISTS `platform/`] — Purpose: tenant overview. Tabs: companies, subscriptions, system health, marketplace, security alerts, usage. Actions: drill-in, suspend, impersonate. Permissions: platform_owner. Workflows: company suspension. KPIs: active companies, trial conversion, MRR. SmartSync: ONLINE-ONLY.
- **Company Management** [EXISTS] — profile, plan, industry pack, modules, branches, users, status, audit. Actions: create/suspend/clone/archive. Permissions: platform_admin. Workflows: provisioning. SmartSync: ONLINE-ONLY.
- **User Management** [EXISTS `settings/users`] — list, invite, deactivate, reset, roles, teams, devices. Workflows: invitation. Permissions: settings.users. SmartSync: ONLINE-ONLY.
- **Role Designer** [PARTIAL `settings/permissions`/`authz`] — name, permission bundles, scope, field access, record access, **preview as role [MISSING]**. Permissions: settings.users/authz. SmartSync: ONLINE-ONLY.
- **Feature Flags** [PARTIAL] — list, status, company availability, **pilot companies/rollout [MISSING]**. SmartSync: ONLINE-ONLY.
- **Subscription/Billing** [PARTIAL `platform/billing`,`/plans`] — plans, add-ons, trials, renewals, metering. KPIs: MRR, churn. SmartSync: ONLINE-ONLY.
- **Marketplace Control** [MISSING].

### Security OS [PARTIAL]
- **Security Dashboard** [MISSING] — login trends, failed attempts, risk users, permission changes, active sessions.
- **Access Policies** [PARTIAL] — password/MFA/IP/session/device rules ([MFA/device MISSING]).
- **Permission Monitor** [PARTIAL] — role changes, exports, approval overrides, sensitive record access. Reports: failed-login, access-change, export, incident. SmartSync: ONLINE-ONLY.

### Master Data OS [PARTIAL]
- **Master Data Dashboard** [PARTIAL] — data health, duplicates, missing GPS/tax, pending approvals, import status. KPIs: data health score.
- **Customer 360** [EXISTS `customers/[id]/360`] — Tabs: overview, sales, collections, returns, visits, surveys, photos, statements, credit, tasks, approvals, attachments, timeline. Actions: create/edit/approve/export. Permissions: customers.manage/approve. Workflows: create/update/credit/deactivation. SmartSync: HYBRID.
- **Product Master** [EXISTS `products`] — overview, pricing, inventory, barcodes, tax, attachments, analytics, audit. Permissions: inventory/products. SmartSync: HYBRID.
- **Supplier 360** [EXISTS `suppliers/[id]`] — overview, contracts, purchases, payments, statements, documents, approvals, analytics. SmartSync: ONLINE-ONLY.
- **Employee Master** [MISSING] · **Asset Master** [MISSING] · **Vehicle Master** [MISSING] · **Warehouse Master** [EXISTS `warehouses`].
- **Import/Export Center** [EXISTS `settings/import`,`/export`,`exports`, `settings/integration-hub`].

### Notification OS [PARTIAL]
- **Notification Center** [PARTIAL `notifications`] — inbox, alerts, approvals, system notices, preferences. SmartSync: HYBRID (read).
- **Template Manager** [MISSING] — body, language, variables, approval, test send.

### Search OS [MISSING]
- **Global Search** [MISSING] · **Search Admin** [MISSING].

### Document Management OS [PARTIAL]
- **Document Dashboard** [MISSING] · **Document Profile** [PARTIAL — attachments only, no versioning]. SmartSync: HYBRID.

### Backup & Recovery OS [PARTIAL]
- **Recovery Dashboard** [PARTIAL `settings/backup`] · **Restore Console** [MISSING]. SmartSync: ONLINE-ONLY.

### Localization OS [PARTIAL]
- **Localization Settings** [PARTIAL `settings`] · **Tax Configuration** [PARTIAL `settings/einvoice` — ETA only; ZATCA MISSING]. SmartSync: ONLINE-ONLY.

### Developer & Extension OS [PARTIAL]
- **Developer Portal** [PARTIAL `settings/integrations/api-keys`,`/webhooks`] · **Extension Review** [MISSING].

---

## BUSINESS OS

### CRM OS [PARTIAL] (`customers`, `crm` i18n)
- **CRM Dashboard** [PARTIAL] — active/inactive/lost/new/at-risk/top customers. KPIs: health, risk. SmartSync: HYBRID.
- **Customer List** [EXISTS] — search, filter, segments, export, bulk. Permissions: customers.manage. SmartSync: HYBRID.
- **Customer Profile** [EXISTS] — (Customer 360 above). SmartSync: HYBRID.
- **Activities** [PARTIAL] — calls, meetings, follow-ups, tasks, next action. Workflows: follow-up. SmartSync: OFFLINE-FIRST (field).
- **Leads/Opportunities** [MISSING].

### Commercial OS [EXISTS] (`sales`, `wholesale`, `market`, `fmcg`)
- **Commercial Dashboard** [PARTIAL] — sales, collections, returns, discounts, trade spend, credit exposure.
- **Orders** [EXISTS `sales/orders`] — draft/submitted/approved/invoiced/cancelled/history. Actions: create/approve/invoice. Permissions: sales.sell. Workflows: order/discount approval. SmartSync: OFFLINE-FIRST (POS/wholesale).
- **Invoices** [EXISTS `sales/invoices`] — open/paid/overdue/void/history; **Credit-review badge [EXISTS, this PR]**. Actions: issue/pay/void/print/ETA. Permissions: sales.sell/collect/void. Workflows: issue, void. SmartSync: order=OFFLINE-FIRST; issue/pay=ONLINE-ONLY (hybrid policy).
- **Collections** [EXISTS] — pending/received/allocated/reconciled. Permissions: sales.collect. SmartSync: ONLINE-ONLY.
- **Returns** [EXISTS `sales/returns`] — requested/approved/rejected/received/settled. Permissions: sales.return. Workflows: return approval. SmartSync: ONLINE-ONLY.
- **Trade Spend** [PARTIAL `ts_*` tables; UI _Unverified_] — programs/claims/ROI/approvals.
- **POS** [EXISTS `market/pos`, `fashion/sell`] — cashier terminal. SmartSync: OFFLINE-FIRST.
- **Quotations** [MISSING].

### Inventory OS [EXISTS] (`inventory`, `warehouses`)
- **Inventory Dashboard** [PARTIAL] — stock value, available/reserved, dead stock, expiry risk, utilization, turnover.
- **Stock View** [EXISTS] — by product/warehouse/batch/expiry/status. SmartSync: HYBRID.
- **Transfers** [EXISTS `inventory/transfers`] — draft/approved/in-transit/received. Workflows: transfer approval. SmartSync: HYBRID.
- **Stock Count** [EXISTS `inventory/count`] — session/variance/approval/posting. Workflows: count approval. SmartSync: ONLINE-ONLY (finalize).
- **Expiry Management** [EXISTS `inventory/expiry`] — risk SKUs/customers, near/expired, actions. SmartSync: HYBRID.

### Finance OS [PARTIAL] (`accounting`)
- **Finance Dashboard** [PARTIAL] — cash, AR/AP aging, profit, collections, budget variance, exposure, top debtors, alerts.
- **AR** [EXISTS] — statements/invoices/collections/aging/credit. SmartSync: ONLINE-ONLY.
- **AP** [PARTIAL] — bills/payments/statements/aging (depth thin).
- **GL** [PARTIAL `accounting/journal`,`/chart`] — chart, **manual journals [MISSING]**, auto journals [EXISTS via triggers], **closing [MISSING]**, trial balance.
- **Banking** [MISSING] — accounts, transactions, reconciliation, transfers.
- **Financial Statements** [PARTIAL `accounting/reports`] — **P&L/BS/CF engine [MISSING]**.
- Workflows: credit/write-off/journal/payment/budget/period-close approval [MISSING]. SmartSync: ONLINE-ONLY.

### HR & People OS [MISSING]
- HR Dashboard · Employee Profile · Attendance · Leave · Performance · Payroll · Recruitment · Training — all [MISSING]. SmartSync: attendance=OFFLINE-FIRST (GPS) when built.

### Procurement OS [PARTIAL] (`purchases`, `suppliers`)
- **Procurement Dashboard** [PARTIAL] · **Purchase Requests** [MISSING] · **RFQ** [MISSING] · **Purchase Orders** [EXISTS `purchases/orders`] (draft/approved/sent/received/closed) · **Receiving** [EXISTS goods receipts] · **Supplier 360** [EXISTS]. Workflows: PR/RFQ/PO/contract approval [PARTIAL]. SmartSync: ONLINE-ONLY.

### Asset & Fleet OS [MISSING]
- Asset Dashboard · Asset Profile · Fleet Dashboard · Vehicle Profile — [MISSING].

### Service OS [MISSING]
- Service Dashboard · Ticket Profile · Knowledge Base — [MISSING] (vertical tickets only in salon/laundry).

### Projects OS [MISSING]
- Project Dashboard · Project Profile · Task Board — [MISSING].

### Governance & Compliance OS [MISSING]
- Governance Dashboard · Risk Register · Audit Findings · Policy Center — [MISSING] (audit logs exist as primitives).

---

## ENTERPRISE OS

### Workflow OS [PARTIAL] (`settings/workflows`, `approvals`, `approval-center`)
- **Workflow Dashboard** [PARTIAL] — active workflows, pending/overdue approvals, escalations, automation health.
- **Workflow Builder** [MISSING] — start/condition/approval/task/notification/API/end (drag-drop).
- **Approval Inbox** [EXISTS `approval-center`] — pending/approved/rejected/escalated/overdue. SmartSync: HYBRID.
- **Workflow Marketplace** [MISSING].

### Analytics OS [PARTIAL] (`reports`, per-module analytics)
- **Executive/Sales/Inventory/Finance Analytics** [PARTIAL — scattered per module] · **Report Builder** [MISSING] · **KPI Builder** [MISSING]. SmartSync: ONLINE-ONLY.

### SmartSync [EXISTS, flag-gated] (`settings/sync`)
- **SmartSync Dashboard** [EXISTS] — status, queue, failed, retry, reconciliation, dead-letter, policies, health.
- **Operator Console** [EXISTS this PR] — failed queue, conflicts, manual retry (per record/all), recovery, audit.
- **Offline Policies** [PARTIAL] — module/attachment/data-limit/sync rules (policy registry `src/lib/sync/policy.ts`).

### Integration OS [EXISTS] (`settings/integrations`, `settings/integration-hub`)
- **Integration Dashboard** [EXISTS] — connector status/success/failure/retry/latency/usage.
- **Connector Setup** [EXISTS] — auth/mapping/schedule/test/activate (6 adapters). SmartSync: ONLINE-ONLY.
- **Event Monitor** [PARTIAL/MISSING] — events/subscribers/failures/replay.

### AI OS [PARTIAL] (`copilot`, `platform/copilot-analytics`)
- **AI Insights Center** [PARTIAL] · **Executive Copilot** [PARTIAL] · **AI Governance** [MISSING].

### Marketplace OS [PARTIAL] (`settings/marketplace`)
- **Marketplace** [PARTIAL] · **Installed Apps** [PARTIAL via entitlements] · **Publisher Console** [MISSING].

---

## INDUSTRY PACK SCREEN TREES (Book 8)

### FMCG Distribution Pack [EXISTS] (`field`, `distribution`, `fmcg`, `rep`)
Per Constitution Book 8 tree — repository coverage:
- Dashboards: Executive/Sales/Distribution/Supervisor/Rep [PARTIAL via `dashboard`,`manager`,`supervisor`,`distribution/*`,`rep`].
- Field Execution: Visits, Merchandising, MSL, Outlet Grading, Surveys, Competitor, GPS, Photos, Near Expiry, Van Reconciliation [EXISTS `field/*`, `distribution/*`, `settings/msl`, `settings/outlet-grades`, `settings/surveys`]. SmartSync: OFFLINE-FIRST.
- Sales/Inventory/Finance/Analytics/SmartSync/Admin: mapped to Commercial/Inventory/Finance/Analytics/SmartSync/Platform OS above.

### Wholesale [EXISTS] · Retail POS [EXISTS] · Fashion [EXISTS] · Pharmacy [EXISTS] · Clinic [EXISTS] · Restaurant [EXISTS] · Laundry [EXISTS]
Screens present per `VANTORA_MASTER_AUDIT.md` module inventory; each reuses Commercial/Inventory/Finance/CRM OS. SmartSync: POS/field=OFFLINE-FIRST, financial=ONLINE-ONLY.

### Hotel [PARTIAL] · Salon [PARTIAL] · Electrical/RMA [PARTIAL] · Workshop [MISSING] · (Manufacturing/Construction/Facility/RealEstate/Education/Logistics/Gym/CarRental/Government/NGO) [MISSING — reserved].

---

## SCREEN-STANDARD COMPLIANCE NOTE
Most existing profile screens implement Header/Actions/Tabs but **do not uniformly include the
Universal tabs Timeline, Comments, and AI Insights** (Art. 08). Recommended: a shared
`EntityProfile` shell enforcing the standard, adopted module-by-module (P2). Every new screen
must declare its **SmartSync class** (Art. 34) — add this to the development checklist
(`IMPLEMENTATION_BACKLOG.md` §5 / Appendix D of the Constitution).
