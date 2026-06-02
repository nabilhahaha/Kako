# Slice FP-CS: Customer Status Blocking (Design — Review First)

*VANTORA multi-tenant ERP · grounded in the live schema + server actions (migrations 0001–0112) · **design only — do not implement yet**, no merge, no production migrations.*

> High-priority follow-up to FP-0. The `customer_status` column already exists (FP-0, migration 0112: `active|inactive|suspended|blocked`). This slice makes it **enforced**.

---

## 1. Goal & guiding principle

Use `customer_status` to **stop new business activity** while a customer is Suspended or Blocked — **without ever obstructing debt recovery.**

> **Non-negotiable (FMCG):** Suspended/Blocked stop *new business*, never *collections*. Existing balances stay visible, account statements stay accessible, and **payments/collections always post** — regardless of status.

## 2. Behavior matrix

| Operation | Active | Suspended | Blocked |
|---|:--:|:--:|:--:|
| New sales **order** | ✅ | ❌ | ❌ |
| New **invoice** (+ issue, POS quick-sale) | ✅ | ❌ | ❌ |
| New **credit** (AR-increasing) transaction | ✅ | ❌ | ❌ |
| **Route** assignment | ✅ | ✅ | ❌ |
| **Rep / customer** assignment (journey) | ✅ | ✅ | ❌ |
| **Payment / collection** | ✅ | ✅ | ✅ |
| **Balance** visible · **statement** accessible | ✅ | ✅ | ✅ |
| Sales **return** (credit note) | ✅ | ✅ *(reduces debt)* | ❌ *(no movement)* |

- **Suspended** = freeze new sales/credit; keep operational links (route/rep) and recover debt.
- **Blocked** = full new-business stop incl. route/rep assignment and credit; collections still allowed.
- `inactive` (the 4th value) = archival/soft-hidden; excluded from new-business pickers and treated like Suspended for transactions. *(Decision D4.)*

## 3. Enforcement — defense in depth

Two layers; the DB layer is authoritative (can't be bypassed), the app layer gives friendly errors and UX.

### 3.1 Shared logic (pure, unit-tested) — `src/lib/erp/customer-status.ts`
```
type CustomerOp = 'order' | 'invoice' | 'credit' | 'route' | 'rep' | 'return' | 'payment';
statusBlocks(status, op): boolean      // the matrix above, in one place
```
Server helper `assertActionable(supabase, customerId, op, t)` → `{ ok } | { ok:false, error }`.

### 3.2 App-layer gates (friendly errors) — exact, real call sites
Each already reads the customer and most already gate on `is_approved`; the status gate sits right beside it (expand the existing `select`).

| # | Where (file · function) | Add gate |
|---|---|---|
| 1 | `sales/orders/actions.ts` · `createSalesOrder` (existing `is_approved` gate ~L32) | block `order` |
| 2 | `sales/invoices/actions.ts` · `createInvoice` (existing `is_approved` + credit gate ~L37) | block `invoice` |
| 3 | `sales/invoices/actions.ts` · `issueInvoice` (~L140, before RPC) | block `invoice` |
| 4 | `sales/pos/actions.ts` · `quickSale` | inherits via `createInvoice` |
| 5 | `sales/returns/actions.ts` · `createReturn` | block `return` (Blocked only) |
| 6 | `customers/actions.ts` · `setCustomerJourney` (existing `is_approved` gate ~L252) | block `rep` |
| 7 | `distribution/actions.ts` · `assignCustomerToRoute` (existing `is_approved` gate ~L42) | block `route` |
| — | `sales/invoices/actions.ts` · `recordPayment` / `rep/actions.ts` · `collectPayment` | **NO gate** (collections always allowed) |

### 3.3 DB-layer safety net (authoritative) — migration 0113
- Helper `erp_customer_status(p_customer uuid) returns text` (SECURITY DEFINER, tenant-guarded).
- **BEFORE INSERT triggers** that `RAISE` when the customer is suspended/blocked:
  - `erp_sales_orders` → reject if status ∈ {suspended, blocked}
  - `erp_invoices` → reject if status ∈ {suspended, blocked}
  - `erp_sales_returns` → reject if status = blocked
- **BEFORE UPDATE OF `salesman_id`, `route_id` ON `erp_customers`** → reject *setting* an assignment when status = blocked (route/rep block).
- **No trigger on `erp_payments`** — collections must always succeed.

This mirrors the FP-0 guard-trigger pattern and guarantees the rule holds even for direct SQL / future RPC paths.

## 4. Schema impact

**Minimal — no new customer column** (`customer_status` shipped in FP-0). Migration **0113** adds:
- `erp_customer_status(uuid)` helper + the BEFORE-INSERT/UPDATE triggers above.
- Seed of a new permission `customers.change_status` into `erp_role_permissions` (global) for `admin`, `manager` (+ optionally `accountant`/finance), mirroring how 0109 seeded `customers.approve`. Company overrides inherit via the existing fallback chain.
- No data backfill (all rows already `active` from FP-0).

## 5. Permissions

- **New permission `customers.change_status`** (recommended over reusing `customers.manage`) so suspend/block/activate is restricted independently of general customer edits.
- Add to `Permission` union + `PERMISSION_LABELS` (group `sales`) in `src/lib/erp/permissions.ts`; grant to admin/manager (+ finance for credit-driven suspensions).
- `upsertCustomer` currently only `requireAuth`s; **a status *change* must check `customers.change_status`** (compare incoming `customer_status` to current; if changed and lacking permission → reject, leaving status untouched).

## 6. Audit impact

Every status change audited via the existing `logAudit` → `erp_log_audit`:
```
logAudit(supabase, { action:'update', entity:'customer_status', entityId:id,
  details:{ previous_status, new_status }, companyId })
```
Add labels: `AUDIT_ENTITY_LABELS['customer_status']`, and (optional) friendlier `suspend`/`block`/`activate` action labels. Visible in the platform audit viewer.

## 7. Workflow impact

- Status change is a **direct, permission-gated, audited** action — **not** a workflow (unlike onboarding/sensitive-change approval). Keeps it operationally fast for collections/credit teams.
- Orthogonal to the approval engine: a customer can be `approved` **and** `suspended`. The onboarding/sensitive-change workflows are unaffected.
- *Future option (out of scope):* route block/unblock of large key accounts through an approval step.

## 8. Credit impact

- Existing over-credit check in `createInvoice` is **unchanged** and **independent of status** (it already blocks active customers over their limit).
- Blocked = "no credit transactions": since all order/invoice creation is blocked for Blocked, AR cannot increase; collections still reduce it.
- **Shared-HO credit (FP-0c) interaction:** a **Blocked Head Office** should stop its branches' new credit business. Recommended: when `credit_model='shared_head_office'`, `erp_customer_available_credit` returns 0 / blocked if the HO node is suspended/blocked. *(Tie-in noted for FP-0c; D3.)*

## 9. Collection impact

**Explicitly preserved.** No gate on `recordPayment` / `collectPayment`; the Customer 360 statement and printable statement remain fully accessible at any status. An **integration test will assert a payment on a Blocked customer succeeds** (guards against regressions).

## 10. Approval impact

- Independent axis from `approval_status`/`is_approved`. Suspending/blocking does **not** change approval state, and approval flows keep working.
- `requires_customer_approval` (FP-0) unaffected.

## 11. Customer 360 (`customers/[id]/page.tsx`)

- **Status badge** in the page header (tone: green active / amber suspended / red blocked), beside the existing actions.
- A short **restriction banner** when Suspended/Blocked ("New orders/invoices are blocked. Collections remain allowed.") so collectors immediately understand what they can still do.
- Edit form already has the `customer_status` select (FP-0); it becomes **permission-gated** by `customers.change_status`.

## 12. Recommended implementation approach (single cohesive slice)

1. **DB (0113):** `erp_customer_status` helper + BEFORE-INSERT triggers (orders/invoices/returns) + BEFORE-UPDATE assignment guard + `customers.change_status` permission seed.
2. **Shared logic:** `customer-status.ts` (`statusBlocks` + `assertActionable`) with unit tests for the matrix.
3. **App gates:** wire the 7 enforcement points (§3.2); explicitly leave payments/collections ungated.
4. **Permission + audit:** gate status change in `upsertCustomer`; audit every change.
5. **Customer 360:** status badge + restriction banner.
6. **i18n:** ar (source) + en for new errors/labels.
7. **Tests:** integration — block matrix (order/invoice/route/rep rejected when suspended/blocked) **and** payment-allowed-when-blocked; unit — `statusBlocks`.

All additive, staging-validated, production held. One slice (it's cohesive and small); ship after FP-0 merges or stacked on it.

## 13. Decisions for your confirmation (recommended in bold)

- **D1.** New permission **`customers.change_status`** (vs reuse `customers.manage`). → **New permission.**
- **D2.** **Sales returns:** allowed when Suspended (reduces debt), blocked when Blocked. → **As stated.**
- **D3.** **Blocked Head Office stops branch new-credit** under shared-HO credit (wired in FP-0c). → **Recommend.**
- **D4.** **`inactive`** = archived: hidden from new-business pickers, treated like Suspended for transactions. → **Recommend.**
- **D5.** Enforcement = **DB triggers (authoritative) + app-layer friendly gates**. → **Recommend.**

---

*Design only. Nothing implemented, nothing merged, no production migrations. Production remains on hold pending your review.*
