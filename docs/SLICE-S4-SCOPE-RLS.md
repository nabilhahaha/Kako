# Slice S4 — Hierarchy Scope + RLS — Design Review

> **Design for approval — no build yet.** The substantive, RLS-verified slice:
> each sales-hierarchy level sees only **their** slice of customers/routes instead
> of the whole company. Builds on S1 (regions/areas + branch links), S2 (roles +
> ranks), S3 (`customer.region_id`/`area_id`/`segment_id`…). **Additive; zero
> regression for company-wide roles** (admin/manager/director/NSM/finance/IT/viewer
> keep full visibility). This is a real security feature — enforced at **RLS**, not
> just in queries — so it needs careful rolled-back-live verification per role.

---

## 1. Goal (locked program decision 2)
Management spans:
`NSM → Regions · Regional Mgr → Areas · Area Mgr → Branches · Branch Mgr → one
Branch · Supervisor → Routes + Reps · Rep → assigned Customers + Routes`.
S4 turns the S2 role keys (which today all see the whole company) into **scoped
visibility**, primarily on `erp_customers` (+ `erp_routes`).

## 2. Grounding — how visibility works today
- **`erp_customers` RLS (0019):** `erp_customers_tenant FOR ALL USING
  (erp_is_platform_owner() OR company_id = erp_user_company_id())` — **company-only**,
  no hierarchy. `erp_routes` (0062) is the same company-only pattern.
- **Transactional tables already branch-scope:** `erp_invoices` / `erp_sales_orders`
  (0005) use `branch_id = ANY(erp_user_branch_ids())`. So a branch-level scope
  precedent already exists for money tables.
- **Helpers that exist:** `erp_user_company_id()`, `erp_is_platform_owner()`,
  `erp_user_branch_ids() → uuid[]` (the current user's assigned branches),
  `erp_is_super_admin()`. **Missing:** any role/visibility resolver.
- **Identity:** `erp_profiles.id = auth.users(id)` (1:1) → `erp_regions.manager_id`
  / `erp_areas.manager_id` (FK `erp_profiles`) compare **directly to `auth.uid()`**.
- **Scope-relevant FKs:** `customer.branch_id` · `customer.region_id`/`area_id`
  (S3) · `customer.salesman_id` · `customer.route_id`; `branch.region_id`/`area_id`
  (S1); `route.rep_id`; `erp_user_branches.reports_to` (0009, today unused).
- **Ranks (S2, `auth-context.ts`):** admin 8 · manager 7 · sales_director 7 ·
  national_sales_manager 7 · regional_manager 6 · branch_manager 6 · it_admin 6 ·
  supervisor 6 · area_manager 5 · accountant 5 · salesman 2 · viewer 0.

## 3. Proposed model — company-wide vs scoped roles
| Role | Visibility |
|---|---|
| `admin`, `manager` (legacy ALL), `sales_director`, `national_sales_manager`, `accountant` (Finance), `it_admin`, `viewer` | **Company-wide** (unchanged — see all) |
| `regional_manager` | customers in **their regions** (`erp_regions.manager_id = me`), matched by `customer.region_id` **or** `customer.branch.region_id` |
| `area_manager` | customers in **their areas** (`erp_areas.manager_id = me`), via `customer.area_id` or `customer.branch.area_id` |
| `branch_manager` | customers in **their branch(es)** — `customer.branch_id = ANY(erp_user_branch_ids())` |
| `supervisor` | customers of **reps who report to them** (`erp_user_branches.reports_to = me`) via `customer.salesman_id`, **plus** their own branch customers |
| `salesman` (Rep) | **their** customers — `customer.salesman_id = me` **or** `customer.route_id ∈` routes where `rep_id = me` |

> A `NULL` region/area/salesman on a customer simply doesn't match a scoped role
> (so unassigned customers are visible only to company-wide roles + whoever owns
> the branch). The platform owner + `admin` always bypass.

## 4. Proposed implementation (additive)
**Migration 010x — SECURITY DEFINER STABLE resolver(s):**
- `erp_user_max_rank()` / `erp_user_is_company_wide()` → true if the user holds any
  company-wide role (from `erp_user_branches.role`). Cheap, drives the fast path.
- `erp_customer_in_scope(c erp_customers) → boolean` — the predicate encoding §3:
  platform-owner / company-wide → true; else the union of the scoped clauses for
  the roles the user holds. Pure reads over `erp_regions`/`erp_areas` (manager_id),
  `erp_user_branches` (branch_ids + reports_to), `erp_routes` (rep_id).

**RLS:** replace `erp_customers_tenant` with
`USING (erp_is_platform_owner() OR (company_id = erp_user_company_id() AND
erp_customer_in_scope(erp_customers)))`. Same shape for `erp_routes`
(rep/branch/region scope). `WITH CHECK` keeps company isolation (see Decision 6).

**Indexes:** already present from S3/0062 (`region_id`, `area_id`, `segment_id`,
`channel_id`, `salesman_id` via 0012, `route_id`, `branch_id`) — confirm coverage;
add any missing (`erp_user_branches.reports_to`).

**App:** list pages need **no change** (RLS narrows the same `select('*')`); the
rep app's client-side `salesman_id` filter becomes redundant but harmless. Verify
no admin/finance screen regresses (they stay company-wide).

## 5. Honest risk + phasing
RLS that calls a resolver per row must be **STABLE + index-friendly**; the scoped
clauses are simple FK/`ANY()` checks (no recursion — `reports_to` is **one level**:
supervisor→reps, not a deep tree). Recommended phasing:
- **S4a (this slice):** resolver + RLS on **`erp_customers` + `erp_routes`** — the
  "who do I serve" core. Rolled-back-live verified for **every** role.
- **S4b (follow-on):** extend scope to rep/supervisor **transactional** rows
  (visits/orders/invoices beyond today's branch scope), if desired. Invoices/orders
  already branch-scope, so branch-level roles are largely covered; S4b only adds
  rep/supervisor customer-level narrowing. Keeps S4a's blast radius bounded.

## 6. Decisions to confirm (S4)
1. **Company-wide set** — confirm §3 row 1 (esp. **Finance** and **Viewer** =
   company-wide read; **IT Admin** = company-wide). Any of these scoped instead?
2. **Multi-role users** — if a user holds several roles, **company-wide if any role
   is company-wide; else union the scoped predicates**? *(Recommended.)*
3. **Manager linkage** — reuse the single `manager_id` on region/area (one manager,
   many regions/areas) for now; **co-management** (many managers per region) = a
   future join table? *(Recommended: reuse.)*
4. **Supervisor linkage** — scope via `erp_user_branches.reports_to` (reps→supervisor)
   **plus** the supervisor's branch customers? Confirm reps' `reports_to` will be
   populated (else supervisor falls back to branch-only). *(Recommended.)*
5. **Geographic basis** — match customers by their own `region_id`/`area_id`
   **and** by their branch's region/area (fallback)? *(Recommended: both.)*
6. **Write scope (`WITH CHECK`)** — should scoped roles also be limited on
   INSERT/UPDATE (a rep can only create/edit customers that fall in their scope, but
   may self-assign new ones), or keep writes company-wide and scope **reads only**?
   *(Recommend: read-scope now; permissive create with self-assignment; revisit
   write-scope in S4b.)*
7. **Breadth** — S4a = `erp_customers` + `erp_routes` only; transactional tables
   stay on today's branch scope until S4b? *(Recommended.)*
8. **Enforcement** — confirm **RLS** (secure, heavier verification) rather than
   query-only filtering. *(Recommended: RLS.)*

## 7. Verification plan (when built)
- **Rolled-back live, per role:** seed a tenant with regions/areas/branches/reps;
  set `region.manager_id`/`area.manager_id`, branch assignments, `reports_to`,
  `route.rep_id`, customer FKs; then assert each role sees exactly its set
  (regional ⊂ company, area ⊂ regional's region, branch ⊂ area, supervisor =
  reps' customers, rep = own) and that **admin/finance/viewer still see all** →
  `0` regression; advisors `0` ERROR; rollback → `0` residue.
- `tsc`/unit (resolver-shape + role mapping tests)/`next build`. **Migration held
  from production** until approved.

## 8. Scope discipline
S4 = visibility/scope only. No new roles (S2 ✅), no new customer fields (S3 ✅),
no labels (S3b), no pricing (separate slice), no promotions (S5). Protected
verticals untouched (they hold none of these FMCG roles → company-wide as today).

*(S4 design — paused for your review + the §6 decisions, especially #1, #6, #8.
On approval I build S4a → tsc/test/build → rolled-back-live verify per role →
draft PR → review package → approval, holding the migration from production. Then
S3b, then the Pricing slice.)*
