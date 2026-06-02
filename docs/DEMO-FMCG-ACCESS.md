# VANTORA — Demo FMCG Access Package

> Login + role + permission package for the **Demo Wholesale** (FMCG Distribution)
> tenant. All accounts created and **verified login-valid** (email-confirmed,
> password set). Demo-tenant only. No new features, no P2/P3.
>
> **Important — role model note:** VANTORA's branch-role model is **flat** (one
> company → branches → users); there is **no regional/area management tier**.
> "Regional Manager" and "Area Manager" therefore map to the **`manager`** role
> (which has full company access). This is labeled in each account's name. A true
> regional/area hierarchy would be a future feature (not built).

---

## 1. Demo accounts (all password = `Demo@1234`)

| # | Requested role | Login email | Actual role | Password |
|---|---|---|---|---|
| 1 | Company Admin | `fmcg.admin@demo.com` | `admin` | `Demo@1234` |
| 2 | Regional Manager | `fmcg.regional@demo.com` | `manager` * | `Demo@1234` |
| 3 | Area Manager | `fmcg.area@demo.com` | `manager` * | `Demo@1234` |
| 4 | Branch Manager | `fmcg.branch@demo.com` | `manager` | `Demo@1234` |
| 5 | Supervisor | `fmcg.supervisor@demo.com` | `supervisor` | `Demo@1234` |
| 6 | Sales Rep | `fmcg.sales@demo.com` | `salesman` | `Demo@1234` |
| 7 | Finance | `fmcg.finance@demo.com` | `accountant` | `Demo@1234` |
| 8 | Viewer | `fmcg.viewer@demo.com` | `viewer` | `Demo@1234` |

\* mapped to `manager` (no regional/area tier in the platform). All 8 share the
same company + branch (Demo Wholesale), so they all see the **same company's
data** — they differ by **what actions/screens their role permits**, not by data
scope (single-branch demo).

- **Tenant:** Demo Wholesale · **Company ID** `1a1dfb3b-9d5c-4a41-9e59-0dbcf3829731`
- **Branch:** main depot (`41eb68f5-…`)

## 2. Role assignments
Stored in `erp_user_branches` (user → branch → role). Each demo user is the
branch's `is_default` member with the role above.

## 3. Permission matrix (actual platform defaults)

| Capability | Admin | Manager (Regional/Area/Branch) | Supervisor | Sales Rep | Finance | Viewer |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Sell (invoices/orders/POS) `sales.sell` | ✅ | ✅ | ✅ | ✅ | — | — |
| Discounts `sales.discount` | ✅ | ✅ | ✅ | — | — | — |
| Collect payments `sales.collect` | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Sales returns `sales.return` | ✅ | ✅ | ✅ | — | — | — |
| Manage customers `customers.manage` | ✅ | ✅ | ✅ | ✅ | — | — |
| View stock `inventory.view` | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Adjust/transfer/count stock | ✅ | ✅ | — | — | — | — |
| Request stock load `stock_request.create` | ✅ | ✅ | — | ✅ | — | — |
| Approve stock load `stock_request.approve` | ✅ | ✅ | ✅ | — | — | — |
| Field sales (rep app) `field.sales` | ✅ | ✅ | — | ✅ | — | — |
| Purchasing `purchasing.manage` | ✅ | ✅ | — | — | — | — |
| Suppliers `suppliers.manage` | ✅ | ✅ | — | — | ✅ | — |
| Accounting view `accounting.view` | ✅ | ✅ | — | — | ✅ | ✅ |
| Post journals `accounting.post` | ✅ | ✅ | — | — | ✅ | — |
| Reports `reports.view` | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| Settings/users/permissions | ✅ | ✅ | — | — | — | — |

(`admin` and `manager` hold ALL permissions; the others are the tailored sets
from `ROLE_PERMISSIONS`.)

## 4. Test passwords
All eight: **`Demo@1234`** (≥6 chars, meets the platform minimum). Reset any via
Platform Owner → Companies → Demo Wholesale → user → Reset Password.

## 5. Demo FMCG data (simple, sales-focused)
- **3 customers**, **5 products**, **1 warehouse** (Main Depot, 200 units/product
  opening stock), **7 sales invoices** (paid / issued / partially-paid mix),
  **~EGP 9,258** revenue. Deliberately light — a clean "sales invoice" story, not
  overloaded.

## 6. What each role sees & does (walkthrough)

- **Company Admin (`fmcg.admin`)** — full access: dashboard, customers, products,
  inventory, sales, purchasing, accounting, reports, **Settings (users, roles,
  marketplace, organization)**. Use this to show the breadth of the platform and
  to manage the company.
- **Regional / Area / Branch Manager (`manager`)** — full operational access like
  admin (incl. settings), minus nothing in this flat model. Use to show a manager
  running the whole branch: approvals, inventory control, purchasing, reports.
- **Supervisor (`fmcg.supervisor`)** — sales-floor leadership: sell, discount,
  collect, returns, manage customers, **approve stock-load requests**, view
  reports. No purchasing/accounting/settings. Good for "team lead" view.
- **Sales Rep (`fmcg.sales`)** — field execution: sell, collect, manage customers,
  view stock, **request stock loads**, **field.sales** (rep app / journey /
  settlement). The van-sales daily-loop persona. No reports/accounting/settings.
- **Finance (`fmcg.finance`)** — accounting view + **post journals**, suppliers,
  collect payments, reports. No selling/inventory edits/settings. The books view.
- **Viewer (`fmcg.viewer`)** — read-only: reports, accounting view, stock view.
  Nothing editable. Good for an exec/observer login.

Because this is a single-branch demo, all roles see the **same company data**;
the difference a prospect feels is **which menu items and actions appear** for
each login (the sidebar + buttons change per role via permission gating).

## 7. Quick demo flow (FMCG)
1. **`fmcg.admin`** → Dashboard (revenue ~EGP 9.3k, receivables), show full nav.
2. **`fmcg.sales`** → Customers → create a quick sale / invoice (sell + collect).
3. **`fmcg.supervisor`** → approve a stock-load request; view sales report.
4. **`fmcg.finance`** → Accounting → journal + aging; record a collection.
5. **`fmcg.viewer`** → show read-only (no create/edit buttons) — contrast.

---
*All accounts created on the Demo Wholesale tenant and verified login-valid
(email-confirmed, password `Demo@1234`). Script: `supabase/demo/fmcg_demo_users_
and_data.sql`. Demo-only; no platform code changed.*
