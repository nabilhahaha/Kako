# Remediation Plan — Backend Enforcement Gaps

**Companion to** `ROLE-PERMISSION-AUDIT.md`. **Scope:** server-side authorization only.
**Status:** PLAN ONLY — no code, migrations, or grants applied. Staging-first when approved.
**Goal:** every critical permission is enforced server-side (route guard **and/or** RLS **and/or**
RPC), never by UI visibility alone.

Each item lists: **(1) Finding · (2) Risk · (3) Affected roles · (4) Current enforcement ·
(5) Proposed enforcement · (6) Regression risk · (7) Effort.** Effort = S (<2h), M (½–1d),
L (1–2d), per item, including ar/en parity + tests.

---

## A. Architecture facts (evidence)

- **Page guards are server-side** (Next.js server components) — there are **no browser-only**
  gates. The exposure is screens with **no guard** (rely on module gate + RLS) and **client-hidden
  actions** whose server action must re-check.
- **RLS enabled on all key tables** (verified) — but policies are **company-scoped (tenant
  isolation)**, not per-permission. RLS stops cross-tenant access; it does **not** stop an
  in-tenant role lacking a permission from reading its company's rows.
- **`SECURITY DEFINER` RPCs bypass RLS by design** → when a function is directly callable
  (PostgREST), its **in-function `erp_user_has_perm` check is the only gate**. Governance/approval
  RPCs have it; several mutation RPCs do not (Section D).
- **Pre-req for severity:** confirm `GRANT EXECUTE` scope on the gap RPCs. If `authenticated` can
  call them directly, missing in-RPC checks are **exploitable**; if execute is restricted, the gap
  is defense-in-depth only. **This grant audit is step 0 of implementation.**

---

## B. Screens protected only by UI hiding (nav visibility ≠ enforcement)

1. **Finding:** Sidebar/bottom-nav items are filtered by permission, but the *destination pages*
   below have **no server-side permission guard** — reachable by typing the URL when the module is
   enabled. Nav hiding is cosmetic.
2. **Risk:** MEDIUM (read exposure of operational/financial data within a tenant).
3. **Affected roles:** any in-tenant role without the intended permission (e.g. `viewer`,
   `salesman`, `merchandiser`) that knows/guesses the URL.
4. **Current enforcement:** nav hides the link + company-scoped RLS on the underlying tables. No
   `hasPermission` in the page.
5. **Proposed enforcement:** add the standard server-component guard at the top of each page
   (mirror the nav permission), redirecting to role home on failure:

   | Route | Intended permission (from nav) |
   | --- | --- |
   | `/collections`, `/cashbox` | `sales.collect` |
   | `/sales/pos`, `/sales/orders` | `sales.sell` |
   | `/sales/returns` | `sales.return` |
   | `/sales/report`, `/reports` | `reports.view` |
   | `/sales/journey`, `/sales/settlement` | `field.sales` (or `reports.view`) |
   | `/inventory`, `/inventory/low-stock`, `/inventory/expiry`, `/warehouses` | `inventory.view` |
   | `/inventory/count` | `inventory.count` |
   | `/inventory/transfers` | `inventory.transfer` |
   | `/suppliers` | `suppliers.manage` |
   | `/customers/[id]/360` | `customers.manage` (read) |

6. **Regression risk:** LOW–MEDIUM. Risk = guarding a page a legitimate role currently reaches by
   URL but whose role lacks the perm in DB (e.g. would a `salesman` legitimately open `/collections`?
   In DB salesman lacks `sales.collect`? — salesman HAS `sales.collect`, so safe). Mitigate by
   diffing each route's intended perm against every role's live grants before enabling, and shipping
   behind a flag (`KAKO_STRICT_PAGE_GUARDS`, default OFF) for a soak period.
7. **Effort:** M (≈15 pages, identical pattern + a guard-coverage test asserting every `(app)` page
   calls a guard).

---

## C. RLS-only screens without explicit permission checks (vertical modules)

1. **Finding:** Most clinic / restaurant / salon / laundry / hotel / fashion / market pages have
   **no page perm guard**; they rely on the **module gate** (company has the module) + RLS. A user
   in a multi-module tenant without the vertical's permission (e.g. `salesman` in a tenant that also
   runs a café) could open `/restaurant/*` by URL.
2. **Risk:** LOW–MEDIUM (only matters in multi-vertical tenants; the pilot is single-vertical FMCG).
3. **Affected roles:** in-tenant roles lacking the vertical permission, in multi-module tenants.
4. **Current enforcement:** module gate + company-scoped RLS. Electrical pages **do** guard
   (`electrical.rma`); pharmacy partially guards.
5. **Proposed enforcement:** add the vertical permission guard to each vertical page
   (`restaurant.manage`, `salon.manage`, `clinic.*`, `hotel.manage`, `laundry.manage`, `market.pos`,
   `fashion.*`), matching the nav perm already defined.
6. **Regression risk:** LOW (single-vertical tenants unaffected; perm == module owner in practice).
7. **Effort:** L (many pages across 7 verticals) — schedule after B; low urgency for FMCG pilot.

---

## D. RPCs without in-function authorization (SECURITY DEFINER)

> **STATUS: IMPLEMENTED & VALIDATED on staging (migration 0314).** Flag-gated
> (`platform.rpc_authz_enforcement`, default OFF; enabled for the pilot tenant only).
> Step 0 done — all 10 RPCs are `authenticated=X` (directly callable), confirming the gap
> is **exploitable**, not just defense-in-depth. A `erp_guard_rpc(variadic perms)` helper was
> injected at the top of each RPC; it no-ops unless the company flag is ON, then verifies the
> caller holds the same permission the route/action already requires (platform-owner/super-admin
> bypass built in). Validated by `supabase/pilot/validate-rpc-authz.sql`: **70 allow/deny
> assertions (7 roles × 10 RPCs) pass**, plus a flag-OFF no-op proof. No app code changed
> (server actions still call the same RPCs); fully reversible via the flag.

1. **Finding:** The following mutation RPCs **do not** call `erp_user_has_perm` (verified via
   `pg_proc`). They scope company but trust the caller for permission:

   | RPC | Action | Permission it *should* check | Severity |
   | --- | --- | --- | --- |
   | `erp_issue_invoice` | issue sales invoice | `sales.sell` | HIGH |
   | `erp_record_payment` | record customer payment | `sales.collect` | HIGH |
   | `erp_record_supplier_payment` | pay supplier | `suppliers.manage`/`accounting.post` | HIGH |
   | `erp_post_payment_voucher` | post payment voucher | `accounting.post` | HIGH |
   | `erp_post_receipt_voucher` | post receipt voucher | `accounting.post` | HIGH |
   | `erp_van_sell` / `erp_van_sell_with_payment` | van invoice (+collect) | `field.sales` (+`sales.collect`) | MEDIUM |
   | `erp_settle_collection` | settle collection | `field.sales`/`sales.collect` | MEDIUM |
   | `erp_van_return` | van return | `field.sales` | MEDIUM |
   | `erp_approve_stock_request` | approve & load stock | `stock_request.approve` | MEDIUM |
   | `erp_apply_van_transfer`, `erp_apply_customer_transfer_row`, `erp_complete_transfer`, `erp_change_request_apply`, `erp_workflow_decide` | post-approval apply / workflow | (internal — caller already checked) | LOW–MEDIUM |

2. **Risk:** HIGH for financial RPCs **if** directly EXECUTE-callable (PostgREST); else MEDIUM
   (defense-in-depth). Governance/approval RPCs are already guarded and are **not** in scope.
3. **Affected roles:** any authenticated user who can invoke the RPC directly without the UI.
4. **Current enforcement:** the calling route/server action checks the permission; RLS scopes
   company; some wrap apex checks. No in-RPC permission gate.
5. **Proposed enforcement:** add a guard clause at the top of each (pattern already used by
   `erp_close_day` / `erp_decide_*`):
   ```sql
   if not erp_user_has_perm(<perm>) and not erp_is_platform_owner() then
     raise exception 'permission denied: %', <perm> using errcode = '42501';
   end if;
   ```
   For the internal "apply" helpers, instead **`REVOKE EXECUTE` from `authenticated`** so only the
   guarded parent RPC (definer) can call them — cleaner than a perm check.
6. **Regression risk:** MEDIUM. The same `ctx` permission is already required by the UI path, so
   legitimate callers pass. Risks: (a) a background/job caller without a user context (use the apex/
   service bypass), (b) the van RPCs are called for a rep whose perm key differs (`field.sales` vs
   `sales.sell`) — must match the exact key the rep holds. Mitigate with a full call-path trace per
   RPC + integration tests for allow & deny, staged behind a per-RPC rollout.
7. **Effort:** M per financial RPC (guard + tests), L total for the batch + the EXECUTE-grant audit.

---

## E. Missing server-side enforcement for DB-only permissions

1. **Finding:** 12 permissions exist in the DB grants but **not in the code `Permission` union**
   (`sales.invoice.cancel`, `sales.payment.writeoff`, `sales.price.override`, `sales.order.cancel`,
   `accounting.voucher.approve`, `inventory.adjustment.approve`, `purchasing.po.approve`,
   `customers.delete`, `change_requests.create/approve/manage`, `trade_spend.manage`). Because they
   aren't typed, no type-safe `hasPermission` call references them — each must be confirmed to have a
   **real** guard somewhere (route, action, or RPC) or it is a **granted-but-unenforced** capability.
2. **Risk:** MEDIUM (a high-impact action like invoice-cancel/payment-writeoff that is granted but
   never actually checked = silent over-permission).
3. **Affected roles:** `accountant` (invoice.cancel, payment.writeoff, voucher.approve),
   `warehouse_keeper` (adjustment.approve), `branch_manager`/`procurement` (po.approve),
   `manager`/`admin` (customers.delete, change_requests.*), `sales_director`/`regional_manager`
   (price.override), `sales_director` (trade_spend.manage).
4. **Current enforcement:** unknown per key — needs a call-site trace. Likely a mix of string-cast
   checks and unenforced grants.
5. **Proposed enforcement:** (a) add the 12 keys to the `Permission` union + `PERMISSION_LABELS`
   (type-safe); (b) trace each to its action/route/RPC; (c) add the guard wherever the action runs;
   (d) where an action has no implementation yet, leave the grant but document it as inert.
6. **Regression risk:** LOW for the type/label addition (additive). MEDIUM where adding a guard to an
   action that previously ran unchecked could block a role that *should* have lacked it (that is the
   point — verify intended holders first).
7. **Effort:** M (type+labels+trace) + S per action guard found.

---

## F. Hidden-UI-only action paths (client-hidden buttons)

1. **Finding:** Screens render action **buttons** conditionally by permission (e.g.
   `/inventory/requests` approve, `/products` create, `/customers` actions, `/inventory` adjust).
   Hiding the button is not enforcement — the underlying **server action / RPC** must re-check.
2. **Risk:** MEDIUM (a crafted request could invoke the action even with the button hidden).
3. **Affected roles:** any role that can reach the page but not the action.
4. **Current enforcement:** button hidden client-side; server action enforcement **varies** (some
   call `hasPermission`, some delegate to an RPC that may/may not check — see Section D).
5. **Proposed enforcement:** audit each conditionally-rendered action's server action; ensure it
   calls `hasPermission(ctx, <perm>)` (or `requireModule`/RPC guard) before mutating. Add a
   lightweight test convention: every exported server action asserts a permission.
6. **Regression risk:** LOW (adds a check that mirrors the already-hidden button).
7. **Effort:** M (inventory + products + customers + stock-request actions are the priority set).

---

## G. Suggested sequencing (when approved)

1. **Step 0 — EXECUTE-grant audit** of the Section D RPCs (decides HIGH vs defense-in-depth). S.
2. **Section D financial RPCs** (`erp_issue_invoice`, `erp_record_payment`,
   `erp_record_supplier_payment`, `erp_post_*_voucher`) — add in-RPC guards + allow/deny tests. M–L.
3. **Section F** server-action re-checks for inventory/products/customers/stock-request. M.
4. **Section B** page guards behind `KAKO_STRICT_PAGE_GUARDS` (default OFF) + coverage test. M.
5. **Section E** type the 12 DB-only perms + trace + guard the financial-control actions. M.
6. **Section C** vertical page guards. L (low urgency for FMCG pilot).

All changes are additive, reversible, staging-first, and validated against every role's live grants
(no role that should pass starts failing). **Nothing proceeds until this plan is approved.**
