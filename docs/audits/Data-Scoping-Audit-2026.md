# Customer / Team Data Scoping Audit

**Scope:** verify row-level visibility for **Sales Rep, Supervisor, Branch Manager,
Admin** across 9 data tables, at the **UI**, **server/query**, and **DB/RLS** levels.
**Analysis only — no fix implemented** (per instruction).

**Environment:** vantora-staging (`rsjvgehvastmawzwnqcs`), pilot company
`612af0bd…`. **Pilot shape: 1 company · 1 branch · 11 customers · 1 rep (6 assigned,
5 unassigned) · supervisor with 0 `reports_to` · admin in 1 branch.** This shape means
several gaps are **latent** today (no second rep/team/branch to leak across) but real
at the policy level.

**Test users:** `salesman@pilot.test`, `supervisor@pilot.test`, `branchmgr@pilot.test`,
`admin@pilot.test`. Evidence = the **actual RLS predicates evaluated act-as each user**
via `erp_user_has_perm`/scope functions (`set request.jwt.claims`).

---

## How scoping works today (current rules)

- **Tenant isolation:** every policy ultimately filters to `company_id = erp_user_company_id()` (or branch/customer scope that is within the company).
- **Role tiers:** `erp_user_is_company_wide()` → TRUE for any role **not** in
  {regional_manager, area_manager, branch_manager, supervisor, salesman} (e.g.,
  admin, manager, accountant, cashier, auditor) → they bypass field scoping.
- **Field scope functions:**
  - `erp_customer_in_scope(branch,region,area,salesman,route)` — **salesman:**
    `salesman_id = auth.uid()` **OR** customer is on the rep's route; **supervisor:**
    `branch_id ∈ my branches` **OR** the customer's salesman `reports_to = me`;
    **branch_manager:** `branch_id ∈ my branches`; regional/area: their region/area.
  - `erp_customer_id_in_scope(customer_id)` — the above, resolved from a row's `customer_id` (used by invoices / visits / returns).
  - `erp_route_in_scope(rep_id)` — **salesman:** own; **supervisor:** own **OR** `reports_to = me` (team); managers: all.
  - `erp_user_branch_ids()` — the user's assigned branches (all branches for super-admin).

**Assignment tables/fields:** `erp_customers(salesman_id, route_id, branch_id, region_id)` · `erp_routes(rep_id, branch_id)` · `erp_visits(salesman_id, customer_id, branch_id)` · `erp_invoices(customer_id, branch_id, created_by)` · `erp_collections(customer_id, branch_id — NO salesman_id)` · `erp_sales_returns(customer_id, branch_id, requested_by)` · `erp_customer_requests(salesman_id, customer_id, company_id)` · `erp_cash_handover_requests(salesman_id, company_id)` · `erp_stock_requests(requested_by, branch_id)` · `erp_user_branches(role, branch_id, reports_to, team_id)` (the team hierarchy).

---

## Exact visibility — measured row counts (act-as each user)

| Table | Sales Rep | Supervisor | Branch Mgr | Admin | Scope basis |
|---|--:|--:|--:|--:|---|
| Customers | **6** | 11 | 11 | 11 | rep: own+route · others: branch/company |
| Visits | **12** | 12 | 12 | 12 | rep: customer-scope · others: branch |
| Sales / Invoices | **42** | 47 | 47 | 47 | rep: customer-scope · others: branch |
| **Collections** | **27** | 27 | 27 | 27 | **branch only (all roles)** |
| Returns | **3** | 3 | 3 | 3 | rep: customer-scope · others: branch |
| **Customer Requests** | **2** | 2 | 2 | 2 | **company only (all roles)** |
| **Cash Handover Requests** | 0 | 0 | 0 | 0 | **company only (all roles)** |
| **Stock Requests** | **4** | 4 | 4 | 4 | **branch only (all roles)** |
| Routes | **1** | **0** | 1 | 1 | rep: own · supervisor: team (0) · mgr/admin: all |

Read: the **rep correctly narrows** on Customers (6<11), Invoices (42<47), Returns,
Visits, Routes. But **Collections / Customer Requests / Cash Handover / Stock Requests
show the SAME count for the rep as for admin** — i.e., **not rep-scoped at the RLS
layer.**

---

## Table-by-table classification

| # | Table | RLS scope | Rep | Supervisor | Branch Mgr | Admin | Verdict | Risk | Recommended fix |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Customers** | `erp_customer_in_scope` | own+route ✅ | branch (not team) ⚠️ | branch ✅ | company ✅ | **Correct (rep/mgr); Gap (supervisor=branch not team)** | Med | Make supervisor clause team-only (`reports_to`), drop the branch-wide OR; configure `reports_to`. |
| 2 | **Visits** | customer-scope CASE | own ✅ | branch ⚠️ | branch ✅ | branch ✅ | Same as Customers | Med | Follows fix #1 (customer-scope already; supervisor tightening). |
| 3 | **Sales / Invoices** | customer-scope CASE | own ✅ | branch ⚠️ | branch ✅ | branch* | **Correct (rep); supervisor Gap; admin caveat** | Med | Supervisor tightening; for admin see note*. |
| 4 | **Collections** | **`branch_id ∈ my branches`** | **branch ❌** | branch | branch | branch | **GAP — not rep-scoped (inconsistent with Invoices)** | **High** | Re-gate `erp_collections` to the SAME customer-scope CASE as invoices (it has `customer_id`). |
| 5 | **Returns** | customer-scope CASE | own ✅ | branch ⚠️ | branch ✅ | branch* | Same as Invoices | Med | Supervisor tightening. |
| 6 | **Customer Requests** | **`company_id` only** | **company ❌** | company | company | company | **GAP — company-wide at RLS** (UI filters to own) | Med | Add RLS scope: rep → `salesman_id = auth.uid()`; approver → team/branch. |
| 7 | **Cash Handover Requests** | **`company_id` only** | **company ❌** | company | company | company | **GAP — company-wide at RLS** | Med | Add RLS scope: rep → `salesman_id`; confirmer → branch. |
| 8 | **Stock Requests** | **`branch_id ∈ my branches`** | **branch ❌** | branch | branch | branch | **GAP — not rep-scoped** (UI filters to own) | Low‑Med | Add RLS scope: rep → `requested_by = auth.uid()`; approver → branch. |
| 9 | **Routes** | `erp_route_in_scope` | own ✅ | team ✅ | all ✅ | all ✅ | **Correct (best-scoped; team-aware)** | — | None. |

\* **Admin caveat (latent):** company-wide users get Invoices/Visits/Returns/Collections via `branch_id ∈ erp_user_branch_ids()` — i.e., their **assigned** branches, not all company branches. In this 1-branch pilot admin sees everything; in a **multi-branch** company a non-super-admin admin would see only assigned branches → under-scoped vs "Admin sees all." Customers, by contrast, are company-wide for admin. (Inconsistent.)

---

## The three levels

- **DB / RLS (authoritative):** gaps above are at this layer — Collections (branch),
  Customer/Cash requests (company), Stock requests (branch) are **not** rep-scoped;
  Supervisor customer/invoice scope is **branch**, not team.
- **Server / query:** the loaders often add tighter scoping than RLS —
  `loadMyRequests` filters `salesman_id`/`requested_by = me`; `loadPendingCustomerRequests`
  is gated by `customer.request.approve`. So the rep's **own-requests UI** is correct
  **even though RLS is company-wide** → the request gaps are **defense-in-depth**
  (a direct API/query bypassing the loader could read others'). Note: `loadRequestCustomers`
  loads **all branch customers** (not just the rep's) for the request dropdowns.
- **UI:** rep screens show own data for requests/visits/sales; the Collections screen
  is branch-list — matching the RLS gap.

---

## Gaps summary (where data is visible across reps/teams/branches)

1. **Collections — HIGH.** Branch-wide for the rep (and everyone). Latent in the
   single-rep pilot (the 27 the rep sees happen to all be their customers), but the
   **policy** lets a rep see **other reps' / unassigned customers' collections** the
   moment a second rep or unassigned-customer collection exists. Inconsistent with
   Invoices, which ARE customer-scoped.
2. **Customer Requests & Cash Handover — MED.** Company-wide at RLS. UI filters to own,
   so no current UI leak, but no DB-level isolation.
3. **Stock Requests — LOW/MED.** Branch-wide at RLS; UI filters to own.
4. **Supervisor (Customers/Visits/Invoices/Returns) — MED.** Branch-wide, not team.
   Latent (1 branch = 1 team here); two supervisors sharing a branch would see each
   other's teams. Note Routes ARE team-scoped — inconsistent.
5. **Admin multi-branch — MED (latent).** Company-wide admin sees only **assigned-branch**
   invoices/visits/returns/collections, not all company branches.
6. **Config gap (not code):** `reports_to` hierarchy is **unconfigured** → supervisor
   team-scoping (Routes) yields nothing and the supervisor falls back to branch on
   customers. The team model can't be validated until `reports_to`/`team_id` are set.

---

## Recommended fixes (NOT implemented — for your approval)

1. **Collections (High):** change `erp_collections` SELECT policy from
   `branch_id = ANY(erp_user_branch_ids())` to the **same customer-scope CASE** used by
   `erp_invoices` (`erp_customer_id_in_scope(customer_id)` for scoped roles). One-policy change.
2. **Customer/Cash/Stock requests (Med):** add per-rep RLS — owner sees own
   (`salesman_id`/`requested_by = auth.uid()`), approver/confirmer sees branch/team.
3. **Supervisor team-isolation (Med):** drop the branch-wide OR for supervisors in
   `erp_customer_in_scope` (keep `reports_to`), and **populate `reports_to`** so teams exist.
4. **Admin multi-branch (Med):** for company-wide users, scope Invoices/Visits/Returns/
   Collections by **company** (not `erp_user_branch_ids`) so Admin truly "sees all".
5. **Re-validate** after enabling a 2-rep / 2-team / 2-branch fixture so the gaps are
   provable, not just latent.

## Status
Audit complete; **nothing changed**. Standing by for your decision on which fixes to
implement and in what order (suggest #1 Collections first — highest risk, smallest change).
