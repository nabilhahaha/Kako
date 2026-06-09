# Van Sales — pilot-tenant enablement guide

How to safely turn Van Sales Mobile Control on for **one pilot tenant**, validate
the loop end-to-end, monitor it, and roll back if needed. All eight production
gates are closed (see `VAN-SALES-DEMO-RUNBOOK.md`), but the module ships **OFF by
default**. Enablement is a deliberate, two-key opt-in — nothing activates
automatically.

> **Approval gate:** Do **not** enable any tenant until the pilot company is
> explicitly approved. This guide prepares the steps; it does not authorize them.

---

## 0. The two-key model (why nothing turns on by accident)

A tenant is **active only when BOTH** are ON (`isVanSalesActive`):

| Key | Scope | Where | Default |
|---|---|---|---|
| `KAKO_VAN_SALES` | Platform master switch (env) | Deployment env vars | **OFF** |
| `erp_van_sales_settings.is_enabled` | Per-company toggle | `/settings/van-sales` | **OFF** |

Setting the env flag exposes the module *capability* platform-wide but activates
**no** company. Each company must still flip its own toggle. To pilot exactly one
tenant: set the env flag once, then enable only the pilot company.

A second flag governs **photos**: `KAKO_MOBILE` gates the offline-media intake
route (`/api/internal/offline-media`) used for variance evidence. Turn it on too
if the pilot should capture photos; the rest of the loop works without it.

---

## 1. Environment flag setup (platform)

1. In the deployment environment for the pilot, set:
   - `KAKO_VAN_SALES=1`
   - `KAKO_MOBILE=1`  *(only if variance-evidence photos are in scope)*
2. Redeploy / restart so the server picks up the env (the flags are read
   server-side per request via `process.env`).
3. Confirm the capability is live but **no tenant is active yet**: visit
   `/settings/van-sales` as a platform owner — the page should render (flag ON)
   while every company's toggle is still OFF.

> Keep the flag scoped to the pilot environment. Do not set it in environments
> that serve other customers until the pilot is signed off.

---

## 2. Company-admin activation path (pilot tenant only)

Performed by a user in the **pilot company** with `settings.branches` (company
admin) — or a platform owner acting for that company.

1. Go to **`/settings/van-sales`**.
2. Toggle **Enable Van Sales** (`is_enabled`) ON.
3. Set policy (see §3), then **Save**.

That writes/updates the single `erp_van_sales_settings` row for the company. No
other company is touched.

### Prerequisites for the pilot company

- **A van warehouse per salesman:** an `erp_warehouses` row with `is_van = true`
  and `assigned_to = <salesman user id>`. Van stock posts here.
- **A source warehouse** with on-hand stock to load from.
- **Roles assigned** (existing role model — no new hierarchy):
  - Salesman → **`field.sales`** (raise requests, confirm loads, sell).
  - Supervisor → **`stock.adjust`** (approve/adjust requests, review variance).
  - Warehouse keeper → **`stock.adjust`** (load manifests, warehouse review).
  - Admin → **`settings.branches`** (this settings page).
  - Photo capture → **`field.attach_media`** (already standard for field reps).
  - Day-close reconciliation → **`reconciliation.approve`** (if used).

---

## 3. Required settings (policy)

Set on `/settings/van-sales`. Recommended **pilot-safe** values:

| Setting | Field | Default | Pilot recommendation |
|---|---|---|---|
| Require physical count on day close | `require_physical_count_on_close` | ON | **ON** — forces a real count before close |
| Allow negative van stock | `allow_negative_van_stock` | OFF | **OFF** — never let a van go negative |
| Auto-confirm supervisor-direct loads | `auto_confirm_direct_load` | OFF | **OFF** — salesman confirmation stays mandatory |
| Discount cap (%) | `discount_cap_pct` | (none) | Set a conservative cap (e.g. **5–10%**) |

> Leave `auto_confirm_direct_load` OFF for the pilot. Even for supervisor-direct
> loads, **no stock enters the van ledger before the salesman confirms** — keep
> that invariant visible during the pilot.

---

## 4. Approval rules (load-request chain)

The request → approval chain runs on the **existing workflow engine**. A
**global default** applies out of the box (no per-tenant setup needed):

- **Definition:** `van_stock_request` · trigger event `van_stock_request.submitted`.
- **Step 1 — Supervisor approval** (`role = supervisor`, sequential, 1 approval,
  SLA 24h, escalate → manager).
- The supervisor may **adjust** the approved quantity; the change is captured
  with a **before/after audit** (`requested_qty`, `approved_qty_before/after`,
  user, reason, timestamp, company).

**To customise for the pilot** (optional): open **`/settings/workflows`**,
duplicate/edit the `van_stock_request` definition for the company (a company-
scoped definition overrides the global default), e.g. add an Area Manager or
Warehouse step. Role-based steps only — no hardcoded users.

---

## 5. Variance and overdue configuration

### 5a. Variance review

When a confirmation has a variance (or full reject), it raises a review on the
existing engine — also a **global default**:

- **Definition:** `van_load_variance` · trigger event `van_load_variance.raised`.
- **Step 1 — Warehouse review** (`role = warehouse_keeper`).
- **Step 2 — Supervisor approval** (`role = supervisor`).

Variance reasons captured at confirmation: **Short, Extra, Damaged, Wrong item,
Expiry, Other** — each with notes and (with `KAKO_MOBILE`) **evidence photos**
attached to the confirmation. The reviewer sees those photos.
Customise the path in **`/settings/workflows`** if the pilot needs a different
chain.

> **Ledger invariant:** only the **accepted** quantity posts to the van
> (`transfer_out` source + `transfer_in` van). Rejected/short quantity never
> moves; there is no auto-deduction.

### 5b. Overdue (credit) behavior

Overdue handling reuses the **credit rules** engine — no van-sales-specific
config. In the credit-rules admin, set the `erp_credit_block_rules` row for
trigger **`overdue_balance`** to one of:

| `block_mode` | Effect at point of sale |
|---|---|
| `warning` | Warn the salesman, allow the sale |
| `approval_required` | Require supervisor approval to proceed |
| `soft_block` | Block, overridable by an authorized role |
| `hard_block` | Block outright |
| `none` | No action |

**Pilot recommendation:** start with **`warning`** or **`approval_required`** so
the field team adapts before hard blocks are enforced.

---

## 6. Pre-go-live validation checklist

Run this as the pilot salesman/supervisor/warehouse users **before** real selling.
Mirrors the CI-validated `van-sales-e2e.test.ts` loop:

- [ ] Env: `KAKO_VAN_SALES=1` (and `KAKO_MOBILE=1` if photos) in the pilot env.
- [ ] `/settings/van-sales` shows the company toggle **ON** with the agreed policy.
- [ ] Van warehouse exists (`is_van`, `assigned_to`) and a source warehouse has stock.
- [ ] **Request:** salesman raises a load request at `/field/van-sales/request`.
- [ ] **Approval:** supervisor approves and **adjusts** a qty; before/after audit recorded.
- [ ] **Load:** warehouse creates the manifest for the approved qty.
- [ ] **Warehouse visibility (before):** manifest appears under *Pending confirmation*
      at `/field/van-sales/warehouse`; van on-hand still 0.
- [ ] **Confirm:** salesman confirms a **partial** load (accept &lt; loaded) at
      `/field/van-sales/confirm`; selects a variance reason; (photos) attaches evidence.
- [ ] **Posting:** only the **accepted** qty appears in van stock; source decremented;
      no auto-deduction of the short qty.
- [ ] **Variance review:** the case shows under *Variance cases*; warehouse→supervisor
      review advances; evidence photos visible.
- [ ] **Reports:** `/field/van-sales/reports` shows requested vs approved vs received,
      fill rate, delivery accuracy, variance.
- [ ] **Offline:** with the device offline, a confirmation queues and syncs on reconnect.
- [ ] **Day close:** if `require_physical_count_on_close` is ON, close is blocked
      without a count.

Sign off only when every box is checked for the pilot tenant.

---

## 7. Rollback

Rollback is **non-destructive** and fast — turning the keys OFF hides the
surfaces; **no posted ledger movements are reversed** (history is preserved).

**Tenant-level (preferred, surgical):**
1. `/settings/van-sales` → toggle **Enable Van Sales** OFF → Save.
   The pilot company's surfaces (`isVanSalesActive` → false) go dark immediately;
   other tenants unaffected.

**Platform-level (full stop):**
2. Unset `KAKO_VAN_SALES` (and `KAKO_MOBILE` if set for this) in the env and
   redeploy. Every Van Sales surface is gated off platform-wide.

**Data note:** Stock already posted to a van stays in the ledger by design.
If a load must be unwound, do it through normal stock-transfer/adjustment flows
(`stock.adjust`) — never by deleting movements. In-flight requests/manifests/
confirmations simply stop being actionable while the flag is off and resume if
re-enabled.

**Workflow note:** customised company-scoped `van_stock_request` /
`van_load_variance` definitions remain in `/settings/workflows`; deactivate them
there if you want to fall back to the global defaults later.

---

## 8. Post-enablement monitoring

Watch these during the pilot (first days closely):

**Operational (in-app):**
- `/field/van-sales/warehouse` — *Pending confirmation* backlog (loads sitting
  unconfirmed) and *Variance cases* awaiting review. Rising backlog = field
  friction or a stuck approver.
- `/field/van-sales/reports` — fill rate, delivery accuracy, net variance per
  salesman. Persistent negative variance or low fill rate flags a process issue.
- Workflow inboxes (`/settings/workflows` runtime) — approvals breaching the 24h
  SLA escalate to manager; check escalations aren't piling up.

**Data integrity (spot-checks):**
- Van on-hand never negative (with `allow_negative_van_stock` OFF).
- Every confirmation has exactly two balanced ledger movements per line
  (`transfer_out` + `transfer_in`) and `posted_at` set; accepted-qty only.
- Variance confirmations carry `requires_review = true` until reviewed.
- Adjustment audit rows present for every supervisor qty change (before/after).

**Photos (if `KAKO_MOBILE` on):**
- Variance evidence attachments resolve on the confirmation; offline-queued
  photos upload on reconnect (no stuck `pending`).

**Logs/health:**
- App error logs for `/api/internal/offline-media` (422/`entity_not_allowed`
  should be rare → indicates a client/version mismatch) and `erp_van_confirm_load`
  failures (atomic RPC rolls back — a spike means bad input or permission gaps).

**Escalation:** if van stock integrity, ledger posting, or financial figures look
wrong, **roll back at the tenant level (§7 step 1)** and investigate before
re-enabling. Stock/financial/GL anomalies are stop-the-pilot events.

---

## Quick reference

| Item | Value |
|---|---|
| Platform flag | `KAKO_VAN_SALES` (photos: `KAKO_MOBILE`) |
| Per-tenant toggle | `erp_van_sales_settings.is_enabled` via `/settings/van-sales` |
| Active when | platform flag AND company toggle both ON |
| Admin perm | `settings.branches` |
| Salesman perm | `field.sales` · Supervisor/Warehouse `stock.adjust` · Photos `field.attach_media` |
| Approval workflow | `van_stock_request` (event `van_stock_request.submitted`) |
| Variance workflow | `van_load_variance` (event `van_load_variance.raised`) |
| Overdue policy | `erp_credit_block_rules`, trigger `overdue_balance` |
| Salesman screens | `/field/van-sales`, `/request`, `/confirm` |
| Warehouse screen | `/field/van-sales/warehouse` |
| Reports | `/field/van-sales/reports` |
| Rollback | tenant toggle OFF → (if needed) unset env flag |
