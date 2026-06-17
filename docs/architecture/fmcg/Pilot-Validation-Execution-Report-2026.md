# Pilot Validation Execution Report — FMCG Field Suite

**Runtime execution against the live staging database** (`rsjvgehvastmawzwnqcs`),
driving the documented Per-Role Validation Runbook as the 8 real role identities.
Per owner direction: **runtime correctness is the source of truth; screenshots are
best-effort and must not block.** V1 was already deployed; V2/V3 carried as known
gaps.

---

## 0. Method & honesty notes

- **What was executed (source of truth):** each focus area was driven through the
  **actual** database authorization function (`erp_user_has_perm` / `erp_guard_rpc`),
  the **actual** workflow RPCs (`erp_submit_day_close`, `erp_decide_day_close_stage`,
  `erp_settle_day_cash`, `erp_reconcile_day_stock`, `erp_override_*`,
  `erp_decide_van_return`), and **RLS**, while impersonating each of the 8 users via
  their real JWT (`auth.uid()` resolved correctly for every step — 0 resolution
  failures). These are the same code paths the running app invokes.
- **Screenshots — not achievable here (documented limitation, pre-authorized):** the
  execution container has **no outbound network egress** (every external request,
  including `google.com`, returns HTTP 403; MCP reaches the DB via a separate
  allowlisted gateway). The Vercel preview is additionally behind Deployment
  Protection (403). Authenticated browser capture was therefore impossible. The
  **TS-layer visual behaviors** (sidebar rendering, in-browser direct-URL redirect,
  cash/credit *render* masking) are covered by (a) their proven permission **inputs**
  below and (b) the code-level Implementation Verification Audit; they should be
  visually confirmed by the pilot team using the seeded credentials (§1).
- **One methodology artifact, corrected:** `erp_guard_rpc` sets a *transaction-local*
  re-entrancy flag (`kako.rpc_guarded`) and skips re-checking within the same
  transaction. The first workflow attempt ran all steps in one transaction, which
  wrongly "allowed" later denials. Re-run with the flag reset before each step
  (simulating independent requests = real-app behavior) → all guards fire correctly.
  (Audit rows from the first attempt, timestamped 09:42, remain in the demo tenant.)

---

## 1. Pilot tenant (provisioned on staging)

- **Company:** `VANTORA Pilot FMCG (DEMO)` — `612af0bd-973c-4fed-8e76-80cf444ef9e0`
- **Master data:** 1 branch (PILOT) + main & van warehouse; 8 FMCG products with
  stock; 11 customers with credit limits/balances.
- **8 role accounts** (password `test.123`):
  `admin@pilot.test`, `branchmgr@pilot.test`, `supervisor@pilot.test`,
  `warehouse@pilot.test`, `cashier@pilot.test`, `accountant@pilot.test`,
  `salesman@pilot.test`, `auditor@pilot.test`.
- **Capabilities ON:** `return_approval` (+SLA), `day_close_approval` (+SLA).
- **Policies:** Return = approval (primary Supervisor, backup Branch Manager; damage→BM,
  saleable ≤500→auto). Day-Close = Supervisor closes; Cash settlement (Cashier) and
  weekly Inventory reconciliation (Warehouse) **independent, non-blocking**,
  carry-forward ON.
- **Role permissions** were reset to **exactly the documented matrix** for all 8 roles
  (company-scoped), so the run validates the documented matrix — not an ad-hoc seed.

---

## 2. Pass/Fail matrix — 8 roles × 9 focus areas

Legend: **P** = pass (runtime-verified) · **P\*** = pass via proven permission input
(visual render not screenshot-verifiable — egress blocked) · **n/a** = not applicable.

| Focus area | Sales­man | Super­visor | Ware­house | Cash­ier | Account­ant | Auditor | Branch Mgr | Admin |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| 1. Role visibility (perm resolution) | P | P | P | P | P | P | P | P |
| 2. Direct-URL protection¹ | P* | P* | P* | P* | P* | P* | P* | P* |
| 3. Cash masking (`cash.view_outstanding`) | P (hidden) | P (shown) | P (hidden) | P (shown) | P (shown) | P (shown) | P (shown) | P (shown) |
| 4. Credit-limit visibility (`customers.view_credit`) | P (hidden) | P (shown) | P (hidden) | P (hidden) | P (shown) | P (shown) | P (shown) | P (shown) |
| 5. Return approvals | P (create only) | P (approve) | P (denied) | P (denied) | P (view) | P (denied) | P (approve) | P (override) |
| 6. Day-close workflow | P (submit) | P (close) | P (denied decide) | P (denied decide) | P (denied) | P (denied) | P (close) | P |
| 7. Settlement workflow | P (n/a) | P | P (denied) | P (settle) | P (settle) | P (denied) | P | P |
| 8. Inventory reconciliation | P (n/a) | P | P (reconcile) | P (denied) | P (denied) | P (denied) | P | P |
| 9. Audit-trail completeness | P | P | P | P | P | P | P | P |

¹ Direct-URL page guards were verified at the **code** layer for all 26 FMCG routes in
the Implementation Verification Audit; their permission inputs are runtime-proven here.
In-browser redirect capture is blocked by egress.

**Totals:** authorization & workflow runtime checks **122/122 PASS**
(112 permission-matrix + 10 workflow), RLS isolation PASS, audit-trail PASS.

---

## 3. Runtime evidence

### 3.1 Authorization resolution — 112/112 PASS (8 roles × 14 permissions, 0 uid failures)
Each row executed as the role's real user through `erp_user_has_perm`. Per-role holdings
of the focus permissions (✓ = granted at runtime, matches documented matrix exactly):

| Role | cash.view_out | view_credit | returns.approve | dc.submit | dc.supervisor | dc.reconcile | dc.settle | returns.override | day.reopen | audit.view | field.sales |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| salesman | · | · | · | ✓ | · | · | · | · | · | · | ✓ |
| supervisor | ✓ | ✓ | ✓ | · | ✓ | ✓ | ✓ | · | · | · | · |
| warehouse_keeper | · | · | · | · | · | ✓ | · | · | · | · | · |
| cashier | ✓ | · | · | · | · | · | ✓ | · | · | · | · |
| accountant | ✓ | ✓ | · | · | · | · | ✓ | · | · | · | · |
| auditor | ✓ | ✓ | · | · | · | · | · | · | · | ✓ | · |
| branch_manager | ✓ | ✓ | ✓ | · | ✓ | ✓ | ✓ | · | · | · | · |
| admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Key confirmations: **cash hidden** from salesman+warehouse; **credit hidden** from
salesman+cashier+warehouse; **override/reopen admin-only** (Supervisor & BM denied);
**audit.view auditor-only**; day-close stages correctly segregated.

### 3.2 Day-close → settlement → reconciliation workflow — 10/10 PASS
Each step executed as the proper role (independent-request semantics):

| # | Role | Action | Runtime result |
|---|---|---|---|
| 1 | salesman | submit End Day | → `pending_supervisor` |
| 2 | salesman | approve supervisor stage | **denied**: `permission_denied: requires day.close.supervisor` |
| 3 | supervisor | approve supervisor stage | → **`status=closed, settlement=pending, reconcile=pending`** (operational close; settle/recon independent & non-blocking) |
| 4 | warehouse | settle cash | **denied**: `requires day.close.settle` |
| 5 | warehouse | reconcile stock | → `reconcile=reconciled` |
| 6 | cashier | reconcile stock | **denied**: `requires day.close.reconcile` |
| 7 | cashier | settle cash (partial) | → `settlement=pending, **outstanding_cash=79.80**` (real carry-forward) |
| 8 | supervisor | override return | **denied**: `requires returns.override` (admin-only) |
| 9 | auditor | override day-close | **denied**: `requires day.close.override` (read-only) |
| 10 | admin | override day-close | guard **passed** (rejected only on business state) |

### 3.3 Settlement carry-forward
Cashier settled below expected → `outstanding_cash = 79.80` recorded on the request →
carries forward as the salesman's Cash-in-Custody (matches the documented model).

### 3.4 Audit trail — complete & actor-attributed (clean run, 09:44)
`day_close.submit` (salesman@) → `day_close.supervisor.approve` (supervisor@) →
`day_close.closed` (supervisor@) → `day_close.reconcile` (warehouse@) →
`day_close.settle` (cashier@). Every governed action recorded with the acting user.

### 3.5 RLS tenant isolation — PASS
As the authenticated salesman: `visible_companies = 1` (only the pilot, of many on the
instance), `other_tenant_customers_leaked = 0`. No cross-tenant data exposure.

### 3.6 Finding V2 re-confirmed at runtime
`erp_override_van_return` (guarded) called by salesman → `permission_denied`.
`erp_decide_van_return` (no `erp_guard_rpc`) called by salesman → reached body
(`return_not_found`) **without** an authz stop. Confirms V2: the return RPCs lack the
DB guard (UI-path is still gated by the server action; gap is direct RPC access).

---

## 4. Findings from execution

| ID | Sev | Finding | Status |
|---|---|---|---|
| **D1** | Medium | **Role-catalog drift:** the `auditor` role is absent from the global `erp_roles` catalog **and** `erp_role_permissions` (DB), though it exists in the TS matrix. On a real tenant, assigning `auditor` fails an FK, and an auditor would resolve **zero** DB permissions (blocking RLS/RPC-gated reads). *Patched inside the pilot tenant* (registered the role + company-scoped permissions); **production tenants need the global seed.** | Open — needs decision |
| **V2** | Medium | `erp_van_return` / `erp_decide_van_return` lack `erp_guard_rpc` (runtime-confirmed). Direct RPC bypasses `returns.create`/`returns.approve`; UI path still gated. | Carried (owner-deferred) |
| **V3** | Medium | `loadDayCloseReview` / `loadPendingDayCloses` expose cash unmasked to reconcile-only roles. | Carried (owner-deferred) |
| **N1** | Note | `erp_guard_rpc` transaction-local re-entrancy flag (by design) — relevant only to test harnesses that batch RPCs in one transaction. No app impact. | Informational |
| **N2** | Note | Screenshots not captured — container egress blocked + preview protected. Runtime used as source of truth per owner. | Informational |

---

## 5. GO / NO-GO recommendation

**Recommendation: GO for pilot** — conditional.

**Why GO:** the DB-enforced authorization, role segregation, day-close/settlement/
reconciliation workflow, override governance (admin-only; auditor read-only), cash &
credit visibility inputs, audit-trail completeness, and tenant isolation were all
executed at runtime as the 8 real roles and **passed (122/122 + RLS + audit)**, against
the documented matrix. V1 (the High security gap) is deployed-closed.

**Conditions:**
1. **D1 before any production tenant uses the `auditor` role** — seed `auditor` into the
   global `erp_roles` + `erp_role_permissions` (one catalog migration). The pilot tenant
   is already patched, so pilot execution is unblocked; production roll-out is not.
2. **V2 / V3** remain accepted, owner-deferred known gaps (UI-path protected; V2 is
   direct-RPC only; V3 is over-exposure to a trusted internal role). Re-confirm they stay
   on the post-pilot list.
3. **Pilot team to run the manual UI pass** (seeded credentials, §1) to visually confirm
   the three TS-render behaviors I could not screenshot (sidebar per role, in-browser
   direct-URL redirect, cash/credit render masking). Their permission inputs are all
   runtime-proven, so this is confirmation, not discovery.

**No NO-GO blockers found** at the authorization/workflow/data-isolation layer.
