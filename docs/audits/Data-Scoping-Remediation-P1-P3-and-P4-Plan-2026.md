# Data-Scoping Remediation — P1–P3 Validation + P4 Plan

## Part A — Priorities 1–3: IMPLEMENTED & VALIDATED

**Applied to vantora-staging** as migration `0339_rls_scoping_p1_p3.sql` (RLS policy
changes only; no app code; writes go via SECURITY DEFINER RPCs and are unaffected).

### What changed (RLS)
| Pri | Table | Before | After |
|---|---|---|---|
| P1 | `erp_collections` (SELECT + ALL) | `branch_id ∈ my branches` | **customer-scope CASE**, identical to `erp_invoices` (rep → their customers; company-wide → branches) |
| P2 | `erp_customer_requests` (read + write) | `company_id = mine` | **owner** (`salesman_id = auth.uid()`) **OR approver** (`customer.request.approve` + rep in my branch) **OR company-wide** |
| P3 | `erp_cash_handover_requests` (read + write) | `company_id = mine` | **owner** **OR confirmer** (`cash.handover.confirm` + rep in my branch) **OR company-wide** |

Both the SELECT and the ALL policy on each table were updated (a permissive ALL policy
also grants SELECT — leaving it broad would keep the leak).

### Validation evidence (act-as each user, post-change predicate counts)
| Role | company-wide | has approve/confirm | Collections | Customer Reqs | Cash Reqs |
|---|:--:|:--:|--:|--:|--:|
| **salesman** | no | **no** | 27 (own customers) | **2 (own only)** | 0 |
| **supervisor** | no | yes | 27 (branch) | 2 (approver/branch) | 0 |
| **admin** | yes | yes | 27 (company branch) | 2 (company) | 0 |

**Proof the Collections fix is correct despite the unchanged count (27):** the new
collections predicate is now **byte-identical to invoices**. The audit already proved
invoices correctly exclude non-rep data — the rep sees **42 of 47** branch invoices (the
5 unassigned customers' 5 invoices are hidden). Collections now use that exact predicate,
so the moment those customers have collections, the rep will not see them. The count is
27=27 today only because the 5 non-rep customers currently have **invoices but no
collections**.

**Proof the Requests fix is correct:** the rep has **no** `customer.request.approve` /
`cash.handover.confirm` → their visibility collapses to `salesman_id = auth.uid()` (own
only). The 2 visible requests are the rep's own. An approver (supervisor) keeps branch
visibility (creq=2), so **the approval queue is preserved** (no regression).

### No regression
- Recording a collection / raising a request → SECURITY DEFINER RPCs, RLS-bypassed → unaffected.
- "My requests" (filtered to `salesman_id`/`requested_by`) → still works.
- Pending-approval queue (supervisor) → still sees branch requests → works.

Single-rep pilot caveat: counts are small and several deltas are 0 because there is no
second rep yet; the fixes are proven by the policy definitions + the invoices-parity
argument. A 2-rep fixture would show explicit count reductions.

---

## Part B — Priority 4 (Supervisor = team): MODEL CONFIRMED + MIGRATION PLAN (await go-ahead)

### Hierarchy model (confirmed)
- **Canonical team link = `erp_user_branches.reports_to`** (a rep's `reports_to` = their
  supervisor's `user_id`). Company-wide, **56** users already have `reports_to` set.
- `team_id` is **unused** (0 rows) and `erp_teams` exists but is not the visibility link →
  **use `reports_to`**, not `team_id`.
- **Pilot currently has 0 `reports_to`** (1 supervisor, 1 salesman) → the supervisor's
  team is empty, which is why the supervisor falls back to branch today.

### Why P4 needs a plan (not just a flip)
`erp_customer_in_scope` currently grants a supervisor **`branch ∈ my branches` OR
`reports_to` team**. Removing the branch clause makes the supervisor **team-only** — but:
1. It is a **GLOBAL** function (all tenants). Any tenant whose supervisors lack
   `reports_to` would see their supervisors lose visibility → cross-tenant regression.
2. The pilot supervisor would see **nothing** until `reports_to` is populated.

### Proposed migration plan (P4)
1. **Configure the pilot team (data):** set the pilot salesman's
   `erp_user_branches.reports_to = <supervisor user_id>` so the supervisor's team exists.
2. **Tighten supervisor scope (function):** in `erp_customer_in_scope`, change the
   supervisor branch from `(branch ∈ my branches OR reports_to)` to **`reports_to` only**
   (team). This also tightens visits/invoices/returns (they resolve through
   `erp_customer_id_in_scope`). Routes are already team-scoped — no change.
3. **Tighten request approver scope (P2/P3 follow-through):** make the supervisor's
   approver clause **team** (`rep reports_to me`) instead of branch, while **branch_manager
   stays branch**. (Role-aware approver scope.)
4. **Cross-tenant safety — pick one:**
   - **(a) Strict team (recommended for correctness):** supervisor = team only; prerequisite
     = ensure `reports_to` is populated for every active tenant's supervisors first.
   - **(b) Fallback-safe:** supervisor with ≥1 report → team only; supervisor with **no**
     reports → branch (prevents regression for unconfigured tenants). Safer rollout, slightly
     less strict.
5. **Validate:** post-change, the pilot supervisor should see **6** customers (the team's,
   = the salesman's) instead of **11** (branch) — a concrete demonstration of team isolation;
   rep unchanged (6), branch_manager branch (11), admin company.

### Target end-state (unchanged from your model)
Sales Rep = own · **Supervisor = team (`reports_to`)** · Branch Manager = branch · Admin = company.

**Decision needed before I implement P4:**
- Confirm **`reports_to`** as the team link (yes/no).
- Choose **(a) strict** vs **(b) fallback-safe** for the global function.
- Confirm it's OK to **set the pilot salesman's `reports_to`** to the supervisor as part of P4.

Nothing for P4 has been implemented.

---

## Part C — Future architecture (recorded; no implementation now)

**Principle:** do **not** hard-code Supervisor / Branch Manager / Area Manager /
Regional Manager / Sales Director visibility as separate rules. Design scoping around a
**single hierarchical `reports_to` tree** so visibility **inherits down the management
chain** (a manager sees every descendant's data — direct **and** indirect reports).

**Target tiers (one mechanism, the tree):**
- Sales Rep → own data
- Supervisor → direct **and indirect** reports
- Area Manager → all teams in area (= their subtree)
- Regional Manager → all areas in region (= their subtree)
- Sales Director → the whole company sales organization (= their subtree / company root)

**How P4 should be built to fit this (forward-compatible):**
- Introduce a **recursive descendants helper**, e.g.
  `erp_reports_subtree(p_manager_id)` → set of all `user_id`s at or below the manager in
  the `reports_to` tree (recursive CTE over `erp_user_branches.reports_to`,
  cycle-guarded).
- Scope predicates become **one rule for all manager tiers**:
  a customer/visit/sale/collection/request is in scope when its owning rep
  (`salesman_id` / `requested_by`) is in `erp_reports_subtree(auth.uid())` — plus
  `own` for reps and `company` for company-wide roles.
- This **replaces** the per-role branches (`branch_manager → branch`, `supervisor →
  reports_to`, `regional/area → region/area`) with **tree inheritance**, so adding a tier
  needs **no new code** — only the `reports_to` edges.
- So P4's supervisor scope should use **`erp_reports_subtree` (direct + indirect)**, not a
  flat `reports_to = me`, to be consistent with this end-state from the start.

**Migration implication:** the org chart must be modeled as `reports_to` edges
(rep → supervisor → area mgr → regional mgr → sales director). `team_id` (currently
unused) can remain a label; the **tree is the source of truth** for visibility.

*Recorded as a future requirement; not implemented. It refines the recommended P4 design
(use the recursive subtree helper rather than flat `reports_to`).*
