# P4 — Recursive `reports_to` Subtree Scoping (Implemented)

**Canonical, future-compatible model.** One recursive rule scopes every manager tier by
their **reports subtree** (direct **and** indirect reports). Fallback-safe: managers with
no `reports_to` configured keep current behavior (no tenant regression). Applied to
vantora-staging as migration `0340_p4_recursive_reports_scope.sql`.

## 1. Migration details
- **Reused** the existing recursive helper `erp_user_subtree(uid)` (a `WITH RECURSIVE`
  walk of `erp_user_branches.reports_to` → user + all descendants).
- **`erp_customer_in_scope`** (drives customers + invoices/visits/returns/collections via
  `erp_customer_id_in_scope`): added one rule — `salesman_id ∈ erp_user_subtree(me)` — that
  serves Supervisor / Area / Regional / Sales Director uniformly. Supervisor branch-wide is
  now **only a fallback** when the supervisor has **no** reports. Rep (own+route),
  branch_manager (branch), regional/area (region/area), and the `erp_role_scope` override
  path are unchanged.
- **`erp_route_in_scope`**: supervisor/manager routes now via `erp_user_subtree(me)`
  (recursive) instead of flat direct-reports.
- **Request policies** (`erp_customer_requests`, `erp_cash_handover_requests`): the approver
  clause now scopes by subtree (team), with branch fallback when no reports — consistent
  with the team model.
- **Pilot data:** set the pilot salesman's `reports_to = supervisor` so the team exists.

## 2. Before / After visibility matrix (measured, vantora-staging)

| Role | Customers | Invoices | Routes | Basis after |
|---|--:|--:|--:|---|
| **Sales Rep** | 6 → **6** | 42 → **42** | 1 → **1** | own + route (unchanged) |
| **Supervisor** | 11 → **6** | 47 → **42** | 0 → **1** | **team (reports subtree)** |
| **Branch Manager** | 11 → **11** | 47 → **47** | 1 → **1** | branch (fallback; `my_reports = 0`) |
| **Admin** | 11 → **11** | 47 → **47** | 1 → **1** | company-wide (unchanged) |

The Supervisor dropped from **branch (11/47)** to **team (6/42)** — exactly the salesman's
data — and gained the salesman's route (0→1, via the subtree). All other roles unchanged.

## 3. Per-role validation
- **Sales Rep** — `company_wide=false`, sees **6** customers / **42** invoices (own); collections
  still customer-scoped (27). Unchanged. ✅
- **Supervisor** — `company_wide=false`, **subtree = {supervisor, salesman}**; now sees the
  team's **6** customers / **42** invoices / **1** route / **2** requests — **not** the branch's 11/47. ✅
- **Branch Manager** — `my_reports=0` → fallback to **branch** (11/47). No regression. ✅
- **Admin** — `company_wide=true` → **company** (11/47). ✅

## 4. Proof: direct AND indirect reports are both included
Using the identical recursive pattern as `erp_user_subtree`, on a synthetic 5-tier org
**Director → Regional → Area → Supervisor → Rep**:
- `director_subtree = {area, director, regional, rep, supervisor}` (**5 members**)
- `includes 'rep' four levels down = true`

So a manager's subtree contains **every** descendant — direct **and** indirect — which is
why the same rule serves Supervisor (team), Area Manager (all subordinate teams), Regional
Manager (all subordinate areas), and Sales Director (entire subtree) with **no per-tier
code**. Real-data check: the pilot supervisor's subtree includes the salesman (direct).

## 5. P1 / P2 / P3 confirmation
- **P1 Collections** — rep still sees **27** via customer-scope (`erp_customer_id_in_scope`);
  unchanged. ✅
- **P2 Customer Requests / P3 Cash Handover** — the **rep-facing** rule is unchanged: a rep
  still sees only their own (`salesman_id = auth.uid()`). P4 only **tightens the approver
  clause from branch → team subtree** (a stricter, consistent refinement — never loosens),
  with branch fallback when no reports. So P1–P3's rep isolation is fully preserved. ✅

## Fallback-safety / cross-tenant
- Supervisor with reports → **team**; supervisor with **no** reports → **branch** (legacy).
- The generic subtree clause is **additive** (grants a manager their subtree; never removes
  visibility). The only restriction (supervisor losing branch-wide) is gated on having
  reports configured — so unconfigured tenants are unaffected.

---

## Roadmap item added: Organization Structure Management UI
Recorded as the standard hierarchy engine for all future roles & industries:
- **Drag-and-drop organization chart** (build/reorder nodes & levels).
- **`reports_to` management** (re-parent users; the visibility subtree updates automatically).
- **Manager assignment** to nodes.
- **Hierarchy visualization** (org tree view).
- **Onboarding-wizard integration** — define org/reporting/product hierarchies + UoM at
  company setup (ties to the *Configurable Hierarchies* architecture).
- Because scoping reads the recursive `reports_to` tree, **adding a tier or company shape
  needs only edges in this UI — no code changes.**

## Status
P4 implemented & validated (migration `0340`). No app code changed; the TS suite is
unaffected (DB/RLS only). Reversible by restoring the prior function bodies + clearing the
pilot `reports_to`.
