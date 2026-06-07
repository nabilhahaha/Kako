# VANTORA — Database Blueprint

> **Method.** Maps the **current repository database** (~157 tables across 175 migrations in
> `supabase/migrations/`, per `VANTORA_MASTER_AUDIT.md`) against the Constitution's entity model
> (Art. 07, 15, 41) and per-OS components. Marks tables **EXISTS / PARTIAL / MISSING**, then lists
> relationships, indexes, audit, RLS/tenant isolation, and high-volume/partitioning needs. No
> schema is redesigned here — this is a gap map + execution guide.

---

## 1. EXISTING TABLES (by Constitution domain)

**Master Data (Art. 15):** `erp_companies`, `erp_branches`, `erp_user_branches`, `erp_regions`,
`erp_areas`, `erp_products_catalog`, `erp_product_categories`, `erp_product_uoms`, `erp_prices`,
`erp_customers` (+`_lookups`,`_attributes`,`_opening_balances`,`_change_requests`,`_transfers`),
`erp_suppliers` (+`_opening_balances`), `erp_warehouses`, `erp_routes` (+`_customers`),
`erp_sequences`, `erp_profiles`, `erp_local_users`.

**Transactions:** `erp_sales_orders`(+`_lines`), `erp_invoices`(+`_lines`),
`erp_sales_returns`(+`_lines`), `erp_purchase_orders`(+`_lines`), `erp_goods_receipts`(+`_lines`),
`erp_purchase_returns`(+`_lines`), `erp_stock_requests`(+`_lines`), `erp_transfer_orders`(+`_lines`),
`erp_van_transfers`(+`_lines`), `erp_van_reconciliations`(+`_lines`), `erp_visits`,
`erp_survey_responses`.

**Financial:** `erp_payments`, `erp_supplier_payments`, `erp_journal_entries`(+`_lines`),
`erp_chart_of_accounts`, `erp_fiscal_periods`, `erp_cost_centers`, `erp_payment_vouchers`,
`erp_receipt_vouchers`, `erp_bank_accounts`, `erp_account_map`, `erp_installment_plans`(+schedule/
payments), `erp_cash_sessions`(+movements), `erp_expenses`.

**Inventory:** `erp_inventory_stock`, `erp_stock_movements`, `erp_stock_counts`(+`_lines`),
`erp_stock_adjustments`.

**CRM/Field:** `erp_journey_plans`, `erp_rep_targets`, `erp_targets`, `erp_work_sessions`,
`erp_visit_compliance`, `erp_surveys`, `erp_msl_*`, `erp_outlet_grade*`.

**Config/Platform:** `erp_roles`, `erp_role_permissions`, `erp_company_roles`,
`erp_company_role_permissions`, `erp_business_type_roles`, `erp_role_limits`, `erp_role_scope`,
`erp_plans`, `erp_plan_modules`, `erp_company_modules`, `erp_business_type_modules`,
`erp_field_config`(+access/sections/templates/versions), `erp_fmcg_settings`, `erp_ops_settings`,
`erp_backups`, `erp_notifications`, `erp_workflow_instances`, `erp_copilot_queries`.

**Audit:** `erp_audit_logs`, `public.audit_logs`, `erp_attachments`.

**Sync/Integration:** `erp_sync_jobs`, `erp_sync_runs`, `erp_integrations`, `erp_webhooks`,
`erp_integration_logs`, `erp_api_keys`. **(Proposed, review-only — not applied):** `sync_rows`,
`sync_ingest`, `sync_review`, `sync_reconcile`, `sync_reconcile_log`, `sync_impersonation_log`.

**Verticals:** clinic (`erp_patients`,`erp_clinic_*`), pharmacy (`erp_pharmacy_*`), salon
(`erp_salon_*`), restaurant (`erp_restaurant_*`), hotel (`erp_rooms`,`erp_bookings`), laundry
(`erp_laundry_*`), fashion (`erp_fashion_*`). **Trade-spend:** `ts_*` (11 tables, usage _Unverified_).

---

## 2. MISSING TABLES (required by Constitution, absent in repo)

| Constitution area | Missing tables (suggested) | Priority |
|---|---|---|
| **HR & People OS (Art. 26)** | `erp_employees`, `erp_org_units`, `erp_attendance`, `erp_leave_requests`/`_balances`, `erp_payroll_runs`/`_lines`, `erp_commissions`, `erp_performance_reviews`, `erp_recruitment_*`, `erp_training_*` | P1 |
| **Asset & Fleet OS (Art. 28)** | `erp_assets`, `erp_asset_assignments`, `erp_asset_maintenance`, `erp_vehicles`, `erp_trips`, `erp_fuel_logs`, `erp_insurance`, `erp_depreciation` | P1 |
| **Service OS (Art. 29)** | `erp_tickets`, `erp_cases`, `erp_sla_policies`, `erp_kb_articles` | P2 |
| **Projects OS (Art. 30)** | `erp_projects`, `erp_tasks`, `erp_milestones`, `erp_timesheets`, `erp_project_resources` | P2 |
| **Governance OS (Art. 31)** | `erp_policies`, `erp_risks`, `erp_controls`, `erp_audit_findings`, `erp_corrective_actions` | P2 |
| **Document OS (Art. 18)** | `erp_documents`, `erp_document_versions` (extend `erp_attachments`) | P2 |
| **Notification OS (Art. 16)** | `erp_notification_templates`, `erp_notification_queue`, `erp_notification_deliveries` | P1 |
| **Workflow OS (Art. 32)** | `erp_workflows`, `erp_workflow_steps`, `erp_workflow_runs`, `erp_sla_timers`, `erp_escalations` (generalize beyond `erp_workflow_instances`) | P0 |
| **Analytics OS (Art. 33)** | `erp_kpi_definitions`, `erp_report_definitions`, `erp_dashboards` | P0 |
| **Event bus (Art. 43)** | `erp_events` (append-only domain events) | P1 |
| **Finance depth (Art. 25)** | `erp_budgets`(+`_lines`), `erp_bank_reconciliations`, manual-journal support exists in `erp_journal_entries` (needs UI not table) | P0 |
| **Security OS (Art. 14)** | `erp_user_sessions`, `erp_user_devices`, `erp_mfa_methods` | P1 |
| **Marketplace OS (Art. 37)** | `erp_marketplace_packages`, `erp_installed_packages` | P3 |

---

## 3. PARTIAL TABLES (exist but incomplete vs Constitution)

- **`erp_attachments`** — has file metadata; **missing versioning + document workflow** (Document OS). Add `erp_document_versions` + `version`, `status` columns.
- **`erp_workflow_instances`** — runtime state only; **missing definition/step/SLA tables** for a real Workflow OS.
- **`erp_notifications`** — in-app only; **missing template/queue/delivery + channels**.
- **`erp_journal_entries`** — supports auto-posting; **manual journal entry path + period-close + statements** are UI/logic gaps (table mostly adequate; verify `reference_type='manual'` flow).
- **`erp_targets`/`erp_rep_targets`** — overlap; consolidate definition.
- **`erp_audit_logs` + `public.audit_logs`** — **duplication**; consolidate to one canonical audit table (debt).
- **Mirror tables `sync_*`** — defined in review-only migrations; **not applied to prod** (apply per cutover).

---

## 4. KEY RELATIONSHIPS (existing, fact)
- `erp_branches.company_id → erp_companies`; `erp_warehouses.branch_id → erp_branches`;
  `erp_customers.branch_id → erp_branches` (+FK `company_id → erp_companies`, `route_id → erp_routes`).
- `erp_invoices.branch_id → erp_branches`, `.customer_id → erp_customers`, `.sales_order_id → erp_sales_orders`;
  `erp_invoice_lines.invoice_id → erp_invoices (CASCADE)`, `.product_id → erp_products_catalog`.
- `erp_payments.invoice_id → erp_invoices`; `erp_inventory_stock UNIQUE(warehouse_id, product_id)`;
  `erp_stock_movements.{warehouse_id,product_id}` + `reference_type/reference_id` (polymorphic to invoice/PO/transfer).
- `erp_journal_entries.reference_type/reference_id` → source doc; `erp_journal_lines.account_id → erp_chart_of_accounts`.
- `erp_user_branches.{user_id→auth,user, branch_id→erp_branches}`; `erp_profiles.id = auth.users.id`.
- **Note:** `erp_invoices` has **no `company_id`** — tenancy via `branch_id → branch.company_id` (intentional; confirmed on branch). New transaction tables should follow the same or carry explicit `company_id` per Art. 41.

---

## 5. REQUIRED INDEXES
- **Existing (fact):** partial-unique `uq_erp_invoices_idem`, `uq_erp_payments_idem` (idempotency); unique `erp_invoices_invoice_number_key`; `erp_inventory_stock UNIQUE(warehouse_id,product_id)`; FK-indexing migrations `0157–0159`; sync feed index `sync_rows(company_id,entity,seq)`; reconcile due index.
- **Add for new tables:** every transaction table → index on `(company_id, created_at)` and `(branch_id, status)`; event table → `(company_id, entity, seq/at)`; notification queue → `(status, next_attempt)`; workflow runs → `(status, next_sla_at)`; attendance/visits → `(user_id, date)`.
- **Idempotency:** any new offline-queue financial/transactional table needs a partial-unique on its idempotency/op key (per SmartSync race protections proven this PR).

---

## 6. AUDIT REQUIREMENTS (Art. 41)
- **Standard (target):** every master/transaction table carries `created_by/created_at/updated_by/updated_at`; sensitive actions log who/when/old/new/reason.
- **Current:** signature columns present on key docs (`voided_by/at`, `approved_by`, `posted_by`, `received_by`); audit tables exist but **duplicated** (`erp_audit_logs` vs `public.audit_logs`).
- **Action (P0 debt):** pick one canonical audit table; route all mutations (incl. new OS) through a shared Audit Engine; ensure financial + impersonation events (`sync_impersonation_log`) are covered.

---

## 7. RLS / TENANT ISOLATION (Art. 14/15)
- **Current (fact):** RLS enabled on 121+ tables; helpers `erp_user_company_id()`, `erp_has_branch_access()`, `erp_is_super_admin()`, `erp_is_platform_owner()`, `erp_user_branch_ids()`; representative policy `USING (erp_is_platform_owner() OR company_id = erp_user_company_id())`.
- **Rules for new tables:** enable RLS; tenant predicate on `company_id` (or branch→company join where the entity lacks `company_id`, mirroring `erp_invoices`); financial RPCs gate on `erp_has_branch_access()`; service-role writes only via audited workers (prefer impersonation over service-role for financial writes, per this PR).
- **Verify:** `sync_*` mirror/ledger/impersonation tables ship with tenant RLS (defined in proposed migrations 0002/0005).

---

## 8. HIGH-VOLUME TABLES — ARCHIVING / PARTITIONING (Art. 51)
- **Highest growth (fact/likely):** `erp_stock_movements`, `erp_audit_logs`/`public.audit_logs`, `erp_visits`, `erp_journal_entries`/`_lines`, `erp_payments`, `erp_invoice_lines`, `erp_notifications`, `erp_integration_logs`, future `erp_events`, and the `sync_rows`/`sync_reconcile_log` mirror.
- **Recommendations:**
  - Time-partition (monthly) `erp_stock_movements`, audit logs, `erp_visits`, journal lines, events, `sync_reconcile_log`.
  - Archive/retention policy for audit + sync logs + notifications (cold storage after N months).
  - Keep idempotency/feed indexes lean; consider BRIN on append-only `created_at`/`seq` columns.
  - Run the `scripts/loadtest/k6-lists.js` suite at target tenant scale before GA (Art. 51 — currently _Unverified_).
- **Analytics isolation (Art. 33/51):** read-heavy reporting should move off the OLTP path (read replica or future Data Warehouse OS) before large-scale rollout.
