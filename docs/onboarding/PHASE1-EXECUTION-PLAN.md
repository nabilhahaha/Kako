# VANTORA — Phase 1 Execution Plan & Implementation Backlog (FMCG Pilot Readiness)

**Goal:** close the Phase-1 gaps that block an FMCG pilot — admin governance, GM/Admin separation, a
Collection Officer workspace, an Inventory Controller role, a full UI role QA, and mobile FMCG validation.
**Tenant:** Nile FMCG (DEMO) on `vantora-staging`, using the seeded 90-day dataset.
**Status:** PLAN ONLY — no implementation in this task; awaiting approval to start.

> Effort unit = **dev-day** (one mid/senior full-stack engineer). Estimates assume the current schema and
> the demo dataset; they include build + self-test, not external review.

---

## 0. Cross-cutting prerequisite (do first)

**P1.0 — Reachable QA build (BLOCKER for P1.5 & P1.6).**
The role-isolation **RLS is already live**, but the matching frontend code (scoped selectors + write guards)
and all Phase-1 UI changes must be on a **reachable** build for the QA/mobile items.
- Deploy the `claude/fmcg-sell-collect-loop` code to a preview wired to `vantora-staging`.
- Make it reachable for QA: disable Vercel SSO **or** add a password/bypass, ideally a temporary domain.
- Confirm `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` point at `vantora-staging`.
- **Effort:** 1d · **Deps:** none · **Risk:** exposure of demo data once public (mitigate with password
  protection); no real customer data present so risk is low.

---

## 1. P1.1 — Company Admin governance (tenant-scoped)

**Objective:** a Company Admin can manage **Branches, Users, Roles & Permissions, Warehouses** *within their
own tenant* — without `is_super_admin` (a platform flag).

**Current state (verified):**
- `/settings/branches`, `/settings/users`, `/settings/permissions` nav items are `superAdminOnly`; their
  pages guard `if (!ctx.isSuperAdmin) …`; their server actions call `requireSuperAdmin()`.
- `/settings/permissions` edits **global** `erp_role_permissions` (super-admin territory).
- **Already tenant-admin-capable:** `/settings/staff` (scoped RPC `erp_company_staff` + `erp_can_manage_staff`)
  and `/settings/authz` (Authz Console) writing `erp_company_role_permissions` — RLS already allows
  `company_id = erp_user_company_id() AND erp_is_company_admin(company_id)`.
- **Warehouses** (`/warehouses`): admin can already manage (RLS `branch_id IN erp_user_branch_ids()`).
- **Branch INSERT is blocked** for tenant admin (RLS `erp_branches_access` checks `id IN branch_ids`, which a
  *new* branch isn't). `erp_roles` create/edit is super-admin only (role *keys* are platform-managed).

**Target state & tasks:**

| Task | What | Effort |
|---|---|---|
| P1.1a | **Branches:** nav `superAdminOnly` → `perm: 'settings.branches'`; page guard `isSuperAdmin` → `has('settings.branches')`; actions `requireSuperAdmin()` → `requireCompanyAdmin()` (new helper using `erp_is_company_admin`), scoped to `erp_user_company_id()`. | 1.5d |
| P1.1b | **Branches RLS:** add company-scoped INSERT/UPDATE/DELETE policy on `erp_branches` (and `erp_regions`/`erp_areas`) — `company_id = erp_user_company_id() AND erp_is_company_admin(company_id)`. Migration. | 1.0d |
| P1.1c | **Users:** route tenant-admin "Users" to the existing **`/settings/staff`** (already scoped); enhance Staff to cover the full lifecycle a pilot needs — invite, assign role, assign branch, activate/deactivate, reset password. Keep `/settings/users` (global, `is_super_admin` editing) super-admin only. | 1.5d |
| P1.1d | **Roles & Permissions:** point tenant-admin "Roles/Permissions" to the **Authz Console** (`/settings/authz`, company-scoped). Verify it can: list roles, edit a role's company permissions, and (optional) clone/disable a role for the tenant. The global `/settings/permissions` stays super-admin only. | 1.0d |
| P1.1e | **Warehouses:** confirm admin access end-to-end (already RLS-supported); add nav clarity. | 0.25d |
| P1.1f | **Security review** of all new write paths (no cross-tenant escape). | 1.0d |

- **Total effort:** ~5–6d · **Deps:** none (foundational) · **Acceptance:** Company Admin (not super-admin)
  can create/edit a branch, invite a user + assign role/branch, edit a role's permissions, and manage
  warehouses — **all limited to their own tenant**, verified by a second tenant being unaffected.
- **Risks:** 🔴 **Cross-tenant privilege escalation** if a new branch/role/user policy or action isn't
  company-scoped — this is the highest-risk item; gate every write on `erp_is_company_admin(company_id)` +
  `erp_user_company_id()` and add a 2-tenant negative test. Role-*key* creation stays platform-only (by
  design) — document that tenant admins customize permissions of existing roles, not invent role keys.

---

## 2. P1.2 — Separate GM from Company Admin

**Objective:** GM (operations leader) ≠ Admin (governance). Admin keeps org administration; GM keeps all
operations but loses governance.

**Current state:** `admin` and `manager` carry near-identical broad company-scoped permission sets.

**Exact permission differences (target):**

| Capability (permission) | Company Admin | GM (now) | GM (target) |
|---|:--:|:--:|:--:|
| settings.users (staff / role admin) | ✅ | ✅ | **❌** |
| settings.branches (branches/regions) | ✅ | ✅ | **❌** |
| settings.custom_fields (fields/data) | ✅ | ✅ | **❌** |
| integrations.manage (import/export/integrations) | ✅ | ✅ | **❌** |
| user.import / user.transfer | ✅ | ✅ | **❌** |
| workflow.manage | ✅ | ✅ | **❌** |
| — operations (unchanged) — | | | |
| sales.sell / sales.collect / sales.credit | ✅ | ✅ | ✅ |
| customers.approve / customers.manage | ✅ | ✅ | ✅ |
| day.approve_close_exception / visit.approve_out_of_route | ✅ | ✅ | ✅ |
| reconciliation.manage / target.manage | ✅ | ✅ | ✅ |
| inventory.* / purchasing.manage | ✅ | ✅ | ✅ |
| accounting.view / accounting.post | ✅ | ✅ | ✅ |
| reports.view / report.aggregate.view | ✅ | ✅ | ✅ |

**Net effect:** GM loses Settings → Staff/Branches/Regions/Custom-Fields/Integrations and user-admin; keeps
the full operational + reporting + approvals surface. Admin is the only tenant role with governance.

**Tasks:** edit the `manager` company-scoped override on the DEMO tenant; mirror in `reference-company.sql`
+ `new-tenant-bootstrap.sql` (so new tenants inherit the split) and/or the global `manager` defaults.
Produce the before/after matrix (above). Regression-check that no operational flow relied on `manager`
holding `settings.*`.

- **Effort:** ~1d · **Deps:** none (do early; clarifies the hierarchy for P1.5 QA) · **Acceptance:** GM login
  shows no Settings-admin/Integrations items; all operational screens intact; matrix delivered.
- **Risk:** 🟡 a flow that assumed `manager == admin` breaks — mitigate with the regression check + QA.

---

## 3. P1.3 — Collection Officer workspace

**Objective:** a dedicated Collections screen so a Collection Officer works AR directly (today collections
are only reachable via Invoices/Settlement).

**Scope of the new `/collections` screen:**
- **Open invoices** — unpaid / partially-paid invoices (with aging buckets), filtered to the officer's scope.
- **Customer balances** — AR per customer (`erp_customers.balance`), outstanding totals, last payment.
- **Collection workflow** — "Record collection" → calls existing `erp_settle_collection` RPC (amount,
  method, optional specific-invoice allocation), shows resulting allocation + new balance; supports partial
  and full settlement; printable receipt (optional).

**Tasks:** new route `/collections` + nav item (gated `sales.collect`, distribution/sales section); server
loader (customers with balance > 0, open invoices, recent collections); client manager UI; a server action
wrapping `erp_settle_collection`; i18n (en/ar). Reuse existing settlement components where possible.

- **Effort:** ~3d · **Deps:** none (RPC + data exist) · **Acceptance:** Collection Officer sees open
  invoices + balances, records a partial and a full collection, and the customer balance + allocation update
  correctly (ties to the seeded AR).
- **Risk:** 🟡 allocation/double-apply correctness — rely solely on `erp_settle_collection` (already
  idempotency-keyed); add a test on the demo AR.

---

## 4. P1.4 — Inventory Controller role (separate from Warehouse Manager)

**Objective:** a stock-accuracy role distinct from Warehouse Manager (today both map to `warehouse_keeper`).

**Exact definition (target `inventory_controller`):**

| Permission | Warehouse Manager (`warehouse_keeper`) | Inventory Controller (new) |
|---|:--:|:--:|
| inventory.view / stock.view / product.search | ✅ | ✅ |
| inventory.count / inventory.adjust | ✅ | ✅ |
| stock.transfer / stock_request.approve | ✅ | ✅ |
| reconciliation.view | ✅ | ✅ |
| inventory.adjustment.approve / stock.transfer.approve | ✅ | **❌** (stock controller proposes, manager approves) |
| reconciliation.manage | ✅ | **❌** (view only) |
| purchasing.manage (Purchase Orders) | ✅ | **❌** |
| uom.manage | ✅ | **❌** |
| fashion.inventory / fashion.purchase | ✅ (latent) | **❌** |

**Screens:** Inventory (Products view, Stock, Low-stock, Expiry, **Stock Count**, Transfers, Warehouses
view), Van Reconciliation (**view**). **No** Purchase Orders, **no** Suppliers, **no** approval of
adjustments/transfers.

**Tasks:** add `inventory_controller` to `erp_roles` (+ company-scoped perms); remap the
`inventory.controller@` demo user from `warehouse_keeper`; bake into `reference-company.sql` +
`new-tenant-bootstrap.sql`; deliver the matrix above.

- **Effort:** ~1.5d · **Deps:** none (quick; mirrors the earlier refined-role pattern) · **Acceptance:**
  Inventory Controller can count/adjust/transfer and view reconciliation, but **cannot** approve
  adjustments, manage purchase orders, or see suppliers.
- **Risk:** 🟢 low; ensure the new role has company-scoped perms (no global default exists → would otherwise
  see nothing, same class of issue as the other refined roles).

---

## 5. P1.5 — Full role QA from the actual UI

**Objective:** validate every role in the running app — menus, screens, buttons, actions, write permissions —
not just DB/code inference.

**Method:** log in as each demo user on the QA build (P1.0) and walk a fixed checklist; log
expected-vs-actual per screen; file defects.

**Coverage matrix (15 roles × screen set):** Platform Owner, Company Admin, GM, Sales Manager, Area Manager,
Supervisor, Van Sales Rep, Cash Van Rep, Merchandiser, Warehouse Manager, Inventory Controller, Accountant,
Collection Officer, Credit Controller, Auditor — each checked for: visible menus; reachable screens (no
403/blank); **action buttons present only when permitted**; **write actions succeed only when permitted**
(attempt a forbidden write → must be blocked at API/RLS, not just hidden); data scope correct (rep sees own
customers, etc.).

**Tasks:** build a per-role checklist; execute; record results; raise fixes (expected to be small after
P1.1–P1.4). Deliver a QA results log + defect list.

- **Effort:** ~2.5d · **Deps:** **P1.0 (reachable build)** + **P1.1–P1.4 done** (so QA validates final state)
  · **Acceptance:** every role's menus/actions match the role spec; forbidden writes are rejected
  server-side; defect list triaged.
- **Risk:** 🟡 requires a reachable build; 🟡 may surface button-level gaps (e.g., a write button shown to a
  read-only role) needing small fixes — budget a follow-up fix pass.

---

## 6. P1.6 — Mobile FMCG validation

**Objective:** validate the field experience on a phone for **Van Rep, Cash Van, Merchandiser, Supervisor**.

**Scope per role:**
- **Van Rep / Cash Van:** Rep App / Today, GPS check-in, van stock, sell (cash; credit for van rep only),
  collect, return, day-close/settlement; offline tolerance (queue + sync).
- **Merchandiser:** visits, assortment/survey/grading capture, no selling.
- **Supervisor:** team view, approvals, reconciliation on mobile.

**Tasks:** run the flows on a real device (and responsive web); verify offline queue/sync, GPS, and that the
cash-van credit option is hidden; log issues; triage fixes.

- **Effort:** ~2.5d · **Deps:** **P1.0 (reachable build)**; can run in parallel with P1.5 · **Acceptance:**
  a rep can complete a full day on a phone (incl. an offline stretch) and data syncs consistently; cash-van
  cannot create credit.
- **Risk:** 🟠 mobile/offline is the least-validated area — expect to find issues; device/browser matrix and
  offline edge-cases may extend effort.

---

## 7. Priority order, sequencing & effort

**Recommended order** (quick wins → foundational → QA):

| # | Task | Effort | Depends on |
|---|---|---|---|
| 1 | **P1.0** Reachable QA build | 1d | — |
| 2 | **P1.2** GM ⁄ Admin split | 1d | — |
| 3 | **P1.4** Inventory Controller role | 1.5d | — |
| 4 | **P1.1** Company Admin governance | 5–6d | — (security review gate) |
| 5 | **P1.3** Collections workspace | 3d | — |
| 6 | **P1.5** Full role QA | 2.5d | P1.0 + P1.1–P1.4 |
| 7 | **P1.6** Mobile validation | 2.5d | P1.0 (∥ with P1.5) |

**Critical path:** P1.0 → P1.1/P1.2/P1.4/P1.3 → P1.5 (+P1.6 in parallel).
**Total effort:** **≈ 16–17 dev-days** (~3–3.5 weeks solo; ~2 weeks with two engineers — one on P1.1, one on
P1.3/P1.4 — then converge on QA). P1.2 and P1.4 are quick wins to land first.

---

## 8. Dependency graph (summary)

```
P1.0 (reachable build) ─┬──────────────► P1.5 (role QA) ◄── P1.1, P1.2, P1.3, P1.4
                        └──────────────► P1.6 (mobile QA)
P1.2 (GM split)  ─ independent ─► (clarifies hierarchy for QA)
P1.4 (Inv Ctrl)  ─ independent
P1.1 (governance)─ independent (security review gate)
P1.3 (collections)─ independent
```

---

## 9. Risk register

| ID | Risk | Sev | Item | Mitigation |
|---|---|:--:|---|---|
| R1 | Cross-tenant privilege escalation via new admin write paths | 🔴 | P1.1 | Gate every write on `erp_is_company_admin(company_id)` + `erp_user_company_id()`; 2-tenant negative test; keep role-key creation platform-only |
| R2 | Removing perms from GM breaks an operational flow | 🟡 | P1.2 | Regression check + QA; remove only governance perms |
| R3 | Collection allocation double-apply / balance drift | 🟡 | P1.3 | Use `erp_settle_collection` only (idempotency-keyed); reconcile against seeded AR |
| R4 | New role with no company perms → user sees nothing | 🟢 | P1.4 | Seed company-scoped perms (same pattern as refined roles) |
| R5 | QA/mobile blocked — no reachable build (SSO/egress) | 🟠 | P1.5/6 | P1.0 first (password-protected public URL) |
| R6 | Mobile/offline defects extend effort | 🟠 | P1.6 | Time-box; triage to a follow-up if non-blocking for pilot |
| R7 | Seed vs live vs global drift (perms defined in 3 places) | 🟡 | P1.1/2/4 | Single source: update DEMO + `reference-company.sql` + `new-tenant-bootstrap.sql` together |

---

## 10. Definition of Done (Phase 1)

- Company Admin manages Branches / Users / Roles & Permissions / Warehouses **within the tenant**, with a
  passing 2-tenant isolation test.
- GM is operations-only; Admin holds governance; before/after matrix signed off.
- Collection Officer has a working Collections workspace (open invoices, balances, settle).
- Inventory Controller is a distinct, narrower role with its own screens.
- A completed per-role UI QA log (15 roles) with forbidden writes rejected server-side.
- A mobile validation log for Van Rep / Cash Van / Merchandiser / Supervisor.
- All permission changes reflected in the DEMO tenant **and** the provisioning seeds.

**Outcome:** Phase 1 lifts FMCG pilot readiness from **~70%** to an estimated **~85–90%** (remaining:
dashboard/report validation and production cutover, per the assessment roadmap).
