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

## F. Client-hidden action paths — server-action enforcement (PLAN)

> **STATUS: PLAN ONLY — not implemented.** Same approach as D: staging-only,
> feature-flagged (`platform.action_authz_enforcement`, default OFF, pilot only),
> reversible, evidence-based, with an allow/deny validation. No rollout until reviewed.

### F.0 Evidence (read from the action sources)

Each row is an exported server action that **mutates** data. "Current guard" is what the
function itself enforces today (verified by reading the code) — not the hidden button or the
page guard.

| Area | Action (file) | Current guard | Gap |
| --- | --- | --- | --- |
| Inventory | `adjustStock` (`inventory/actions.ts`) | `inventory.adjust` OR `stock.adjust` | ✅ guarded |
| Inventory | `createTransfer` (`inventory/transfers/…`) | `requireAuth` only | ❌ no perm |
| Inventory | `completeTransfer` (`…/transfers`) | `inventory.transfer` OR `stock.transfer.approve` | ✅ guarded |
| Inventory | `cancelTransfer` (`…/transfers`) | `requireAuth` only | ❌ no perm |
| Inventory | `createStockCount` (`…/count`) | `requireAuth` only | ❌ no perm |
| Inventory | `saveStockCount` (`…/count`) | `requireAuth` only | ❌ no perm |
| Inventory | `finalizeStockCount` (`…/count`) | `inventory.count` | ✅ guarded |
| Inventory | `cancelStockCount` (`…/count`) | `requireAuth` only | ❌ no perm |
| Stock req | `createStockRequest` (`inventory/requests/…`) | `requireAuth` only | ❌ no perm |
| Stock req | `approveStockRequest` | `stock_request.approve` (+ RPC guard, §D) | ✅ guarded |
| Stock req | `setStockRequestLoadingDate` | `stock_request.approve` | ✅ guarded |
| Stock req | `rejectStockRequest` | `requireAuth` only | ❌ no perm |
| Stock req | `cancelStockRequest` | `requireAuth` only | ❌ no perm |
| Product | `upsertProduct` (`products/actions.ts`) | gates **price** (`pricing.manage`/`product.create`) + **uom** (`uom.manage`) subfields only | ⚠️ base create/edit ungated |
| Product | `toggleProductActive` | `requireAuth` only | ❌ no perm |
| Product | `createCategory` | `requireAuth` only | ❌ no perm |
| Product | `addDrugsToProducts` | `requireAuth` only | ❌ no perm |
| Customer | `upsertCustomer` (`customers/actions.ts`) | gates **status** change (`can('customers.status.change')`) only | ⚠️ base create/edit ungated |
| Customer | `importCustomers` | `requireAuth` only | ❌ no perm (`customer.import`) |
| Customer | `setCustomerJourney` | approval + visibility scope; no `journey.create` | ⚠️ partial |
| Customer | `toggleCustomerActive` | critical-action audit; perm check to verify | ⚠️ verify |
| Customer | `decideCustomerApproval` | `can('customers.approval.approve')` | ✅ guarded |
| Customer | `requestCustomerGpsChange` / `requestCustomerApproval` / `requestCreditLimitChange` | action-policy gated (governed request → guarded RPC) | ✅ governed |

**Note:** the customer module already has an alias-based capability helper (`can()` with
`customers.change_status → customers.status.change`, `customers.approve →
customers.approval.approve`). The fix must **reuse `can()`**, not add a parallel system.

### F.1 The findings (the ❌ / ⚠️ rows above)

1. **Finding:** ~12 mutating server actions enforce only `requireAuth` (any authenticated user)
   or gate a sub-field only, relying on the hidden button + RLS write-scope for permission.
2. **Risk:** MEDIUM. A crafted POST (server actions are HTTP endpoints) can invoke the mutation
   without the permission the UI implies. RLS still scopes the company/branch, so it is **not**
   cross-tenant, but an in-tenant under-privileged role (e.g. `viewer`, `salesman`) could
   create/edit/deactivate products, customers, transfers, counts, or stock requests.
3. **Affected roles:** any in-tenant role that can reach the page but lacks the action's intended
   permission — e.g. `viewer` (product/customer writes), `salesman`/`merchandiser` (transfers,
   counts), `warehouse_keeper` (customer/product writes).
4. **Current enforcement:** `requireAuth` + company-scoped RLS write-scope (S4b) + the hidden
   button. No action-level permission for the ❌ rows.
5. **Proposed enforcement:** a small flag-gated helper mirroring D, used at the top of each
   under-guarded action:
   ```ts
   // returns an error ActionResult when the flag is ON and the caller lacks the perm; else null
   const denied = await requireActionPerm(ctx, ['inventory.transfer', 'stock.transfer']);
   if (denied) return denied;
   ```
   - `requireActionPerm` reads `platform.action_authz_enforcement` for the company (no-op when
     OFF), then checks `hasPermission`/`can` for ANY of the listed perms (super-admin/platform
     owner already pass `hasPermission`).
   - Proposed perm per action:

     | Action | Proposed perm(s) |
     | --- | --- |
     | `createTransfer` / `cancelTransfer` | `inventory.transfer` OR `stock.transfer` |
     | `createStockCount` / `saveStockCount` / `cancelStockCount` | `inventory.count` |
     | `createStockRequest` | `stock_request.create` |
     | `rejectStockRequest` / `cancelStockRequest` | `stock_request.approve` (reject) · creator-or-`stock_request.approve` (cancel) |
     | `upsertProduct` (base) | `product.create` (create) OR `inventory.adjust` (edit) |
     | `toggleProductActive` / `createCategory` / `addDrugsToProducts` | `product.create` (or `product.import` for drugs) |
     | `upsertCustomer` (base) | `customers.manage` OR `customer.create` (create) / `customer.edit` (edit) |
     | `importCustomers` | `customer.import` |
     | `setCustomerJourney` | `journey.create` |
     | `toggleCustomerActive` | `customers.change_status` |

   - **Note (missing perm key):** there is no `product.edit` permission. Proposal: gate product
     edits on `product.create` (or add a `product.edit` key in a later Section E pass). Flagged
     so we agree the key before coding.
6. **Regression risk:** MEDIUM. The guard mirrors the already-hidden button, so legitimate UI
   users pass — but some actions are currently reachable by roles that *should* keep access (e.g.
   a `salesman` self-creating a customer via `upsertCustomer`: salesman holds `customer.create`?
   In the pilot DB **salesman lacks `customer.create`** but the page self-assigns the rep — so
   guarding `upsertCustomer` on `customer.create` would block salesman customer creation, which
   may be intended to flow through the **governed customer-request** instead). Each action's perm
   must be diffed against every role's live grants **before** enabling; ambiguous ones
   (`upsertCustomer`, `setCustomerJourney`) are decided with you, not assumed.
7. **Effort:** M. One helper + ~12 call sites + unit tests; no schema change.

### F.2 Validation (allow/deny, same rigor as D)

- **Pure helper unit tests** (vitest): `requireActionPerm` allows when flag OFF; when ON, allows
  iff the ctx holds any listed perm; super-admin/platform-owner always pass. Allow/deny asserted
  per role using `permissionsForRole(role)` for all roles.
- **Role × action matrix** (doc + a SQL/data check): for each action's proposed perm, list the
  roles that pass under the live pilot grants — reviewed before enabling, so no legitimate role
  loses access.
- Flag enabled for the **pilot only**; integration tests run with the flag OFF (unaffected).

### F.3 Open decisions for you (before coding F)

- **`upsertCustomer` create by salesman:** keep direct create gated on `customer.create` (pilot
  salesman lacks it → would be blocked, pushing them to the governed customer-request), or allow
  rep self-create? (Recommend: route reps through the governed request; gate direct create on
  `customer.create`.)
- **`product.edit` key:** add a dedicated permission, or reuse `product.create` for edits?
- **`addDrugsToProducts`:** gate on `product.import` or a pharmacy-specific perm?

---

## G. Suggested sequencing (when approved)

1. ✅ **Step 0 — EXECUTE-grant audit** (done: all 10 RPCs `authenticated=X` → exploitable).
2. ✅ **Section D financial/transactional RPCs** — in-RPC guards + 70-assertion allow/deny matrix.
3. **Section F** server-action re-checks (this plan) — flag `platform.action_authz_enforcement`. M.
4. **Section B** page guards behind `KAKO_STRICT_PAGE_GUARDS` (default OFF) + coverage test. M.
5. **Section E** type the 12 DB-only perms + trace + guard the financial-control actions. M.
6. **Section C** vertical page guards. L (low urgency for FMCG pilot).

All changes are additive, reversible, staging-first, and validated against every role's live grants
(no role that should pass starts failing). **Section F awaits approval before implementation.**
