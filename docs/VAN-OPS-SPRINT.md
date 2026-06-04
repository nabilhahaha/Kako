# VANTORA — Van Operations Readiness Sprint

> Mobile-first, salesman-first, FMCG. **Additive** — reuses existing schema; no
> new tables/fields, no migrations, no production data change, no AI. Prepared
> `2026-06-04`.

## Route-sales systems inspected (patterns only, no code)
**Pepperi, Repsly, BeatRoute, StayinFront, FieldAssist, RoutePro** — van stock on
the device, stock-risk badges (low/out), collection receipts, return slips,
route/coverage health, today's journey cards.

## Schema reused (verified in production)
- `erp_payments` (+ invoice/customer/company) → **collection receipts**.
- `erp_sales_returns` (+ `erp_sales_return_lines`, reasons) → **return slips / history**.
- `erp_inventory_stock` (`quantity`, `reserved_qty`) → **stock visibility** (available = qty − reserved).
- `erp_products_catalog`, `erp_warehouses`, `erp_customers`, `erp_companies` for labels.

## Shipped (prod-working)
| Priority | Item | Status |
| --- | --- | --- |
| 1 | **Van/warehouse stock visibility** (`/field/stock`) | ✅ available + in/low/out badges, risk-first, summary. |
| 3 | **Sales returns** | ✅ existing `/sales/returns` (management) **+ new printable return slip** `/sales/returns/[id]/print`. |
| 4 / 7 | **Collections + receipt printing** (`/collections/[id]/receipt`) | ✅ printable payment receipt (reuses `erp_payments`). |
| 8 | **Return history** | ✅ via existing `/sales/returns` + returns now on the **Customer 360 timeline** (linking to the slip). |
| 9 | **Stock risk indicators** | ✅ pure `stock-risk.ts` (out/low/ok, risk-first) + tests. |
| 10 | **Route health indicators** | ✅ existing `territory.ts` / coverage (Manager/Supervisor/Territory). |

Receipts and return slips are also reachable by tapping the matching event on
**Customer 360** (timeline events now deep-link to print views).

## Documented data gaps (no schema invented — per the rules)
| # | Item | Missing | Required |
| --- | --- | --- | --- |
| 2 | **Near-expiry visibility** | `erp_inventory_stock` has **no expiry/batch column** | a batch/lot table or `expiry_date` on stock (migration) + near-expiry read. Stock screen shows a clear note. |
| 5 | **Today journey customer cards** | `erp_journey_plans` / `erp_route_customers` are in the **unapplied drift** (not in production) | residual drift closure → then surface today's customers as one-tap cards on `/today`. |
| 6 | **Route completion & compliance** (per-rep detail) | `erp_visit_compliance` / `erp_work_sessions` are **drift** | available once drift closes; coverage/health already shown defensively where data exists. |
| — | **Van-specific stock scoping** | no clean rep→van/warehouse assignment in production | stock screen shows RLS-scoped warehouse stock; per-van scoping needs the van assignment (drift). |
| — | **Stock reorder point** | no `reorder_point` on `erp_inventory_stock` | uses a documented default threshold (10) until the field exists. |
| — | **Returns/credits in statement** | `erp_sales_returns` ✅ in prod, but statement ledger currently invoices+payments | add returns as credits to the statement (follow-up). |

## Components added
`stock-risk.ts` (+tests), `/field/stock`, `/collections/[id]/receipt`,
`/sales/returns/[id]/print`; reused `PrintBar`, `ActivityTimeline` (return icon),
`salesman` + new `vanops` i18n.

## Navigation
Added **Stock** (`/field/stock`, gated `inventory.view`/`field.sales`). Receipts
and return slips are deep routes reached from Customer 360 / lists.

## Estimated business value increase
**High for van/route reps** — on-device stock with risk badges, printable
collection receipts and return slips, and returns on the customer timeline are
core route-sales daily-driver capabilities, all additive over production data.
