# VANTORA — Sales Foundation Architecture (Approved)

**Status:** ✅ **APPROVED & frozen** — architecture only; **no code, no migrations,
no implementation** yet. Implementation planning deferred.
**Goal:** a generic, industry-neutral **order-to-cash (O2C)** foundation with
**first-class FMCG distribution** (route sales, van sales, trade promotions,
customer classification, territory coverage, collections) — reused across all
verticals.
**Discipline:** *reuse over rebuild; formalize what exists first; document gaps
separately; additive; flag-gated; multi-tenant + permission model preserved.*

> **Not greenfield (rich FMCG core already on `main`).** Formalize:
> `erp_customers` (route_id, salesman_id, visit_day, credit_limit, balance,
> is_approved), `erp_sales_orders`/`_lines`, `erp_invoices`/`_lines`,
> `erp_sales_returns`/`_lines`, `erp_routes`+`erp_route_customers`,
> `erp_journey_plans`, `erp_visits`+`erp_visit_compliance`, `erp_van_transfers`/
> `_lines` + `erp_van_reconciliations`/`_lines`, `erp_payments`/`_vouchers`/
> `erp_installment_payments`, `erp_credit_limit_requests`, `erp_price_lists`/
> `_items`, `erp_outlet_grades`(+factors/history), and `customers.*`,
> `sales.sell/collect/discount/return/export`, `pricing.manage`,
> `collections.export`. **Gaps:** quotations, delivery notes, promotions/trade
> spend, customer agreements, channels (see Gap register §C).

O2C **document spine** mirrors the ledger/P2P pattern: each document has a status
lifecycle and links downstream via `reference_type/reference_id`
(quote→order→delivery→invoice→return), so postings and shipments drill back.

---

## A. Order-to-cash spine

1. **Customers — EXISTS → formalize.** `erp_customers` (code, name, route_id,
   salesman_id, visit_day, credit_limit, balance, is_approved, tax_number, hierarchy
   via parent). Formalize: onboarding/approval (Workflow), credit profile (§10),
   classification/channel (§14), geo (territory §7-field). RLS + Search provider
   already shipped.
2. **Quotations — GAP.** Add `sales_quotations`/`_lines` (customer, validity,
   pricing, status draft→sent→accepted→converted) → convert to a sales order. Feeds
   pipeline; optional in pure van-sales flows.
3. **Sales Orders — EXISTS → formalize.** `erp_sales_orders`/`_lines` (customer,
   order_number, status, totals, salesman). Formalize: status lifecycle, reservation
   of stock (Inventory §16), pricing/promotions derivation (§11-12), credit check
   gate (§10), partial fulfilment.
4. **Delivery Notes — GAP.** Add `delivery_notes`/`_lines` (dispatch/proof-of-
   delivery between order and invoice) — picks stock, drives the **issue movement**
   to Inventory, supports partial/over delivery and ePOD. In van sales the
   load-out + on-truck sale collapses order→delivery→invoice (see §8).
5. **Sales Invoices — EXISTS → formalize.** `erp_invoices`/`_lines` (number, status,
   net/tax, ETA fields, idempotency_key). Formalize: from order/delivery or direct;
   tax via Finance tax engine; AR posting (§17); ETA e-invoicing via egress connector.
6. **Sales Returns — EXISTS → formalize.** `erp_sales_returns`/`_lines` (reason,
   approved_by). Formalize: link to invoice/lot/serial, symmetric stock+cost+tax
   reversal, credit-note to AR. Approval via Workflow.

## B. FMCG distribution (first-class)

7. **Route Sales & territory coverage — EXISTS → formalize.** `erp_routes` +
   `erp_route_customers` + customer `route_id`/`visit_day`. Formalize: territory →
   route → customer hierarchy, **coverage planning** (planned vs actual visits),
   per-route salesman assignment, and coverage KPIs.
8. **Van Sales — EXISTS → formalize.** `erp_van_transfers`/`_lines` (load-out to a
   **van warehouse**, `is_van` from Inventory) + `erp_van_reconciliations`/`_lines`
   (end-of-day settlement: stock + cash). Formalize: load → on-truck sell (order/
   delivery/invoice collapsed) → returns → **day-close reconciliation** (stock vs
   sales vs cash) with variance approval. Van stock is real Inventory (multi-warehouse).
9. **Collections — EXISTS → formalize.** `erp_payments`/`_vouchers` +
   `erp_installment_payments` + `sales.collect`/`collections.export`. Formalize:
   receipt vouchers against invoices/customer balance, on-route cash collection,
   reconciliation, installments, and AR application (§17).
15. **Visit-to-Order workflow — EXISTS → formalize.** `erp_journey_plans` +
   `erp_visits` + `erp_visit_compliance`. Formalize the field flow: journey plan →
   check-in (GPS) → survey/merchandising/compliance → **take order / van sale /
   collect** → check-out. The visit is the FMCG entry point that emits order/
   collection events; reuses Workflow for compliance gating.

## C. Commercial controls

10. **Credit Limits & Credit Control — EXISTS → formalize.** Customer `credit_limit`
   + `balance` + `erp_credit_limit_requests` (the credit-review Workflow). Formalize:
   **credit check at order/delivery** (block/approve over-limit or overdue — reuses
   the existing status-block trigger pattern), credit-limit change approval
   (Workflow), exposure = open orders + unpaid invoices.
11. **Pricing & Price Lists — EXISTS → formalize.** `erp_price_lists`/`_items`
   (sell-side, default/active, company-scoped). Formalize: price-list assignment by
   customer/channel/classification, price hierarchy (list → customer/channel
   override → promo), currency, and a **price resolution** rule used by orders/
   quotes/van sales.
12. **Promotions & Trade Spend — GAP.** Add `promotions` (mechanic: discount/BOGO/
   bundle/free-goods/rebate, conditions, period, budget) + `trade_spend` (accruals/
   claims against a promo budget). Promotions evaluate at pricing time; trade spend
   posts to Finance (accrual + settlement) and can require **approval** (the
   trade-spend workflow modeled earlier). FMCG-critical.
13. **Customer Agreements — GAP.** Add `customer_agreements` (annual deals, rebate
   tiers, listing fees, payment terms, target volumes) → drive pricing/promotions
   and rebate accrual; approval + validity periods.
14. **Customer Classification & Channels — PARTIAL → formalize + extend.** Outlet
   grading exists (`erp_outlet_grades`+factors+history = dynamic classification).
   Formalize classification as a customer dimension; **add channel** (traditional
   trade / modern trade / HoReCa / wholesale / key account) as a first-class
   attribute driving pricing, promotions, coverage, and reporting.

## D. Integrations

16. **Inventory integration.** Orders **reserve** stock; delivery notes / van sales
   create **issue movements** (valued → COGS); returns create receipt movements; van
   load-out = transfer to a van warehouse; availability respects reservations.
   Lot/serial/expiry (FEFO) honored on dispatch.
17. **Finance integration.** Events drive posting rules: `invoice.issued` → AR +
   Revenue + output tax + **COGS** (perpetual); `payment.received` → Dr Bank/Cash /
   Cr AR; returns reverse; trade-spend → accrual/settlement; van day-close → cash
   posting. `reference_type/id` gives order↔invoice↔journal drill-down. Tax + ETA via
   the Finance tax engine/egress connector.
18. **Workflow integration.** Customer onboarding/approval, credit-limit & over-limit
   approval, return approval, discount-above-threshold, promotion/trade-spend &
   agreement approval, van reconciliation variance, visit compliance — all **workflow
   definitions** (Builder/Canvas), maker-checker, SLA/escalation.
19. **Search OS integration.** Customers already indexed; add **providers** for
   sales orders, quotations, invoices, delivery notes, returns, routes, promotions.
   Find by document number / customer / route; deep-link.
20. **Multi-company support.** RLS-first scoping (customer/branch/route/warehouse →
   company), per-company price lists, promotions, routes, credit policy, classification
   schemes, and document sequences. Van/route stock isolated per tenant.

---

## C. Gap register (documented separately)

| Area | State | Gap to add |
|---|---|---|
| Quotations | **Missing** | `sales_quotations`/`_lines` + quote→order conversion |
| Delivery Notes | **Missing** | `delivery_notes`/`_lines` (dispatch/ePOD) → Inventory issue |
| Promotions & Trade Spend | **Missing** | `promotions` + `trade_spend` (mechanics, budget, accrual, approval) |
| Customer Agreements | **Missing** | `customer_agreements` (deals, rebates, listing fees, targets) |
| Channels | **Partial** | first-class `channel` attribute (classification exists via outlet grades) |
| Credit exposure | **Partial** | open-order + unpaid-invoice exposure calc + order-time credit gate (limit/requests exist) |

**Already present (formalize, not rebuild):** customers, sales orders, invoices,
returns, routes/route-customers, journey plans, visits/compliance, van transfers +
reconciliation, payments/vouchers/installments, credit-limit requests, price
lists/items, outlet grades (classification).

---

## Design principles

O2C document spine with status + `reference_type/id`; FMCG field flow
(journey→visit→order/van-sale/collect→day-close) as first-class; pricing/promotion
resolution rule; events as the seam to Inventory + Finance; approvals via Workflow;
discoverability via Search; additive + flag-gated; RLS-first multi-tenancy. No
second sales engine; no per-industry fork.

---

## Open questions for review

1. **Van-sales document model:** collapse order/delivery/invoice into one on-truck
   sale doc, or keep linked docs with auto-fill?
2. **Promotions engine depth in V1:** discount/free-goods first, or include
   rebates/bundles/trade-spend accrual now?
3. **Delivery notes:** always-on (separate dispatch) vs. optional (direct-invoice
   verticals)?
4. **Credit gate point:** at order, at delivery, or both? Hard block vs. approval
   override?
5. **Channel model:** enum vs. a configurable channel registry (per company)?
6. **First consumer flow:** route visit → van sale → day-close reconciliation →
   AR/cash posting as the end-to-end FMCG validation against Inventory + Finance.

*Architecture **APPROVED & frozen** — no code, migrations, implementation, or
branches. Implementation planning deferred until requested.*
