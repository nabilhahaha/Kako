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
| **Sales return** (credit note) | ✅ | ✅ | ✅ |
| **Balance** visible · **statement** accessible | ✅ | ✅ | ✅ |

- **Suspended** = freeze new sales/credit; keep operational links (route/rep) and recover debt.
- **Blocked** = full new-business stop incl. route/rep assignment and credit; collections still allowed.
- **Sales returns are always allowed** (every status) — expiry, quality issues, recalls, damages, and stock recovery must work even when a customer is Blocked. Returns *reduce* exposure, so they sit with collections as recovery operations, never new business.
- `inactive` (the 4th value) = archival/soft-hidden; excluded from new-business pickers and treated like Suspended for transactions. *(Decision D4.)*

## 2.1 Status reason & change history (NEW)

Capture **why** and **when** a customer was suspended/blocked, so Sales, Finance and Collections all see the context.

- **`status_reason_id`** → a **new company-managed lookup kind `status_reason`** (consistent with segment/channel/business_type — *not* a hard enum). Seeded defaults (company-editable): Over Credit Limit, Outstanding Payments, Compliance Issue, Legal Hold, Management Decision, Temporary Suspension.
- **`status_reason_note`** (optional free text) — extra context beyond the picked reason.
- **`status_changed_at`** + **`status_changed_by`** — stamped **automatically** whenever `customer_status` changes (BEFORE-UPDATE trigger → authoritative regardless of code path; `status_changed_by = auth.uid()`).

Reason is **optional** but **strongly encouraged for Suspended/Blocked** (UI nudge; not a hard requirement so collections aren't slowed). When returning to **Active**, the reason is cleared (and the clear is itself stamped + audited).

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
| 5 | `customers/actions.ts` · `setCustomerJourney` (existing `is_approved` gate ~L252) | block `rep` |
| 6 | `distribution/actions.ts` · `assignCustomerToRoute` (existing `is_approved` gate ~L42) | block `route` |
| — | `sales/returns/actions.ts` · `createReturn` | **NO gate** (returns always allowed — recovery/expiry/recall) |
| — | `sales/invoices/actions.ts` · `recordPayment` / `rep/actions.ts` · `collectPayment` | **NO gate** (collections always allowed) |

### 3.3 DB-layer safety net (authoritative) — migration 0113
- Helper `erp_customer_status(p_customer uuid) returns text` (SECURITY DEFINER, tenant-guarded).
- **BEFORE INSERT triggers** that `RAISE` when the customer is suspended/blocked:
  - `erp_sales_orders` → reject if status ∈ {suspended, blocked}
  - `erp_invoices` → reject if status ∈ {suspended, blocked}
- **BEFORE UPDATE OF `salesman_id`, `route_id` ON `erp_customers`** → reject *setting* an assignment when status = blocked (route/rep block).
- **No trigger on `erp_payments` or `erp_sales_returns`** — collections **and returns** must always succeed (debt + stock recovery).

This mirrors the FP-0 guard-trigger pattern and guarantees the rule holds even for direct SQL / future RPC paths.

## 4. Schema impact

`customer_status` shipped in FP-0. Migration **0113** adds:
- **Reason + history columns** on `erp_customers`: `status_reason_id uuid → erp_customer_lookups(id)`, `status_reason_note text`, `status_changed_at timestamptz`, `status_changed_by uuid` (all additive/nullable).
- **`status_reason` lookup kind**: extend the `erp_customer_lookups.kind` CHECK to include `'status_reason'` (drop/recreate, as FP-0 did for `business_type`) + seed defaults via the `erp_seed_company_customer_lookups` fn (CREATE OR REPLACE) so new companies get them.
- `erp_customer_status(uuid)` helper + the BEFORE-INSERT/UPDATE triggers (§3.3) + a BEFORE-UPDATE trigger that stamps `status_changed_at/by` (and clears the reason on return to Active).
- Seed a new permission `customers.change_status` into `erp_role_permissions` (global) for `admin`, `manager` (+ optionally `accountant`/finance), mirroring how 0109 seeded `customers.approve`. Company overrides inherit via the existing fallback chain.
- No data backfill (all rows already `active` from FP-0; reason/history null until first change).

## 5. Permissions

- **New permission `customers.change_status`** (recommended over reusing `customers.manage`) so suspend/block/activate is restricted independently of general customer edits.
- Add to `Permission` union + `PERMISSION_LABELS` (group `sales`) in `src/lib/erp/permissions.ts`; grant to admin/manager (+ finance for credit-driven suspensions).
- `upsertCustomer` currently only `requireAuth`s; **a status *change* must check `customers.change_status`** (compare incoming `customer_status` to current; if changed and lacking permission → reject, leaving status untouched).

## 6. Audit impact

Every status change audited via the existing `logAudit` → `erp_log_audit`, including the reason:
```
logAudit(supabase, { action:'update', entity:'customer_status', entityId:id,
  details:{ previous_status, new_status, reason_id, reason_note }, companyId })
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

**Explicitly preserved.** No gate on `recordPayment` / `collectPayment` / `createReturn`; the Customer 360 statement and printable statement remain fully accessible at any status. Integration tests will assert that **a payment AND a sales return on a Blocked customer both succeed** (guards against regressions).

## 10. Approval impact

- Independent axis from `approval_status`/`is_approved`. Suspending/blocking does **not** change approval state, and approval flows keep working.
- `requires_customer_approval` (FP-0) unaffected.

## 11. Customer 360 (`customers/[id]/page.tsx`)

- **Status block** prominently showing **Status + Status Reason + Last Status Change Date** (and by whom) — the at-a-glance context for Sales/Finance/Collections.
- Badge tone: green active / amber suspended / red blocked, beside the existing actions.
- A short **restriction banner** when Suspended/Blocked ("Blocked — reason: Outstanding Payments (since 2026-05-10). New orders/invoices are blocked; collections remain allowed.").
- Edit form gains a **reason select** (from the `status_reason` lookup) + optional note next to the FP-0 `customer_status` select; the whole status change is **permission-gated** by `customers.change_status`.

## 12. Recommended implementation approach (single cohesive slice)

1. **DB (0113):** reason+history columns; `status_reason` lookup kind + seeds; `erp_customer_status` helper; BEFORE-INSERT triggers (orders, invoices — **not** returns); BEFORE-UPDATE assignment guard; BEFORE-UPDATE stamp of `status_changed_at/by` (+ clear reason on Active); `customers.change_status` permission seed.
2. **Shared logic:** `customer-status.ts` (`statusBlocks` + `assertActionable`) with unit tests for the matrix.
3. **App gates:** wire the 7 enforcement points (§3.2); explicitly leave payments/collections ungated.
4. **Permission + audit:** gate status change in `upsertCustomer`; persist reason/note; audit every change.
5. **Customer 360:** status + reason + last-change-date block + restriction banner; reason select in the edit form.
6. **i18n:** ar (source) + en for new errors/labels; `status_reason` manageable in Settings → Customer Data.
7. **Tests:** integration — block matrix (order/invoice/route/rep rejected when suspended/blocked) **and** payment-AND-return-allowed-when-blocked, plus `status_changed_at/by` stamped; unit — `statusBlocks`.

All additive, staging-validated, production held. One slice (it's cohesive and small); ship after FP-0 merges or stacked on it.

## 13. Decisions for your confirmation (recommended in bold)

- **D1.** New permission **`customers.change_status`** (vs reuse `customers.manage`). → **New permission.**
- **D2.** **Sales returns: ALWAYS allowed** (Active/Suspended/Blocked) — expiry, quality, recalls, damages, stock recovery. → **Approved (revised).**
- **D3.** **Blocked Head Office stops branch new-credit** under shared-HO credit (wired in FP-0c). → **Recommend.**
- **D4.** **`inactive`** = archived: hidden from new-business pickers, treated like Suspended for transactions. → **Recommend.**
- **D5.** Enforcement = **DB triggers (authoritative) + app-layer friendly gates**. → **Recommend.**
- **D6.** **Status reason = company-managed lookup** (`status_reason` kind) + optional note; **optional** field (encouraged, not enforced, for Suspended/Blocked); reason cleared on return to Active. → **Recommend.**

---

*Design only. Nothing implemented, nothing merged, no production migrations. Production remains on hold pending your review.*
