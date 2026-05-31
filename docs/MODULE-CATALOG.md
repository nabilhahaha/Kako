# VANTORA — Module Catalog

Every module is **independently adoptable**, **config-gated** (plan entitlement ∩
business type ∩ marketplace toggle), and has **no hard dependency** on another
module (graceful degradation). Ownership (system-of-record) is configurable per
module/entity — see [`MODULE-OWNERSHIP-MATRIX.md`](MODULE-OWNERSHIP-MATRIX.md).

Status: ✅ built · 🟡 partial · 🔜 planned. Permissions are from
`src/lib/erp/permissions.ts`; entities from `src/lib/erp/entities.ts`.

> Adoption examples: *Sales only*, *Inventory only*, *Workflow only*, *Analytics
> only*, or any combination up to the full platform.

---

## Sales ✅
- **Purpose:** quotations, orders, invoices, returns, collections (POS for retail;
  van/wholesale flows for distribution).
- **Entities:** `order` (`erp_sales_orders`), `invoice` (`erp_invoices`).
- **Permissions:** `sales.sell`, `sales.discount`, `sales.collect`,
  `sales.return`, `market.pos`, `wholesale.pricing`.
- **SoR options:** VANTORA owns sales execution; orders/invoices commonly **push
  out** to an external ERP's finance/inventory.

## CRM ✅🟡
- **Purpose:** customers/accounts, contacts, credit limit, journey/visit history.
- **Entities:** `customer` (`erp_customers`); customer journey.
- **Permissions:** `customers.manage`.
- **SoR options:** typically **VANTORA-owned**; customers may sync **in** from an
  ERP that owns master data. (Pipeline/opportunity CRM = 🔜.)

## Field Operations ✅
- **Purpose:** rep journeys, routes, visits, van stock, field sales.
- **Entities:** `visit` (`erp_clinic_visits` / visit records), route/journey.
- **Permissions:** `field.sales`, `stock_request.create`, `stock_request.approve`.
- **SoR options:** VANTORA-owned (front-office execution).

## Approvals & Workflow ✅
- **Purpose:** entity-agnostic multi-step approvals; conditional + parallel +
  quorum; SLA timers + escalation (`reports_to`); in-app notifications; Builder.
- **Tables:** `erp_workflow_definitions/_steps/_instances/_tasks`,
  `erp_notifications`.
- **Permissions:** `workflow.manage`.
- **SoR options:** VANTORA-owned (orchestrates any module/entity).

## Analytics & Reporting ✅🟡
- **Purpose:** reports, exports, role-based dashboards.
- **Permissions:** `reports.view` (+ Export Engine, `integrations.manage` for bulk
  export).
- **SoR options:** VANTORA reads across modules; BI export **out** to external
  warehouses. (Advanced dashboards/BI = 🟡/🔜.)

## Trade Spend 🟡🔜
- **Purpose:** promotions, trade agreements, settlements (FMCG/Sales module).
- **Status:** FMCG promotions partial; full trade-spend settlement engine
  planned.
- **SoR options:** VANTORA-owned; settlements **push out** to ERP finance.

## Inventory & Warehousing ✅
- **Purpose:** products/catalog, stock levels, counts, transfers, warehouses.
- **Entities:** `product` (`erp_products_catalog`), `branch`/warehouse.
- **Permissions:** `inventory.view`, `inventory.adjust`, `inventory.transfer`,
  `inventory.count`.
- **SoR options:** often **ERP-owned** in coexistence → stock/items sync **in**;
  VANTORA-owned when standalone.

## Procurement ✅
- **Purpose:** suppliers, purchase orders, receiving.
- **Entities:** `supplier` (`erp_suppliers`).
- **Permissions:** `purchasing.manage`, `suppliers.manage`.
- **SoR options:** ERP-owned in coexistence (sync **in**/**both**); VANTORA-owned
  standalone.

## Billing ✅
- **Purpose:** SaaS billing — multi-currency plans/price books, trials,
  subscriptions, invoices, country VAT. (Distinct from sales invoices.)
- **Tables:** `erp_billing_*`. **Currencies:** SAR, AED, KWD, QAR, BHD, OMR, EGP,
  USD.
- **Gating:** owner-only administration. See [`LICENSING.md`](LICENSING.md).
- **SoR options:** **VANTORA-owned** (platform billing).

## Finance ✅🟡
- **Purpose:** chart of accounts, journals/vouchers, posting, AR aging.
- **Permissions:** `accounting.view`, `accounting.post`.
- **SoR options:** commonly **ERP-owned** in coexistence (VANTORA posts summaries
  out); VANTORA-owned standalone. (Egyptian e-invoicing: [`ETA.md`](ETA.md).)

## Integrations ✅
- **Purpose:** inbound REST API (`/api/v1`), outbound webhooks, external-system
  connections + scheduled sync. Itself a module/entitlement.
- **Permission:** `integrations.manage`.
- **Docs:** [`INTEGRATION.md`](INTEGRATION.md), [`API-WEBHOOKS.md`](API-WEBHOOKS.md),
  [`SYNC-ENGINE.md`](SYNC-ENGINE.md), [`INTEGRATION-ADAPTERS.md`](INTEGRATION-ADAPTERS.md).
- **SoR options:** the bridge that makes per-module coexistence possible.

---

### Cross-cutting (every module inherits)
Custom Fields, Dynamic Forms, Import/Export, Audit, Notes/Attachments,
Notifications, Permissions/RLS, and the Workflow Engine — all entity-based, so a
module gains them automatically by registering its entities.

> ⚠️ Status marks reflect current build state and may lag the code — verify
> against `permissions.ts` / `entities.ts` / the relevant migration when precise
> status matters.
