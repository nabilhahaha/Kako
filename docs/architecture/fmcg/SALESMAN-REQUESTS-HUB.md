# Salesman "Requests" Hub — Review & Recommendation (design only)

**Status:** Design review — **no implementation yet.** Reuse-first, flag-gated, reversible.
**Goal:** Replace the obsolete "Salesman App" concept with a **Requests** area that
gathers every salesman-initiated operational request under one tab — without new
engines, and without duplicate selling/customer entry points.

**Final van-salesman bottom nav:** `Today · Van Stock · Requests · More`.

---

## 1. Current infrastructure (grounded inventory)

The six request types are backed by **six different systems** at different maturity.
"Reuse" below = the create path already exists and works.

| # | Request | Status | Create (perm) | Approve (perm) | Backend / create flow | Approver surface today |
|---|---|---|---|---|---|---|
| 1 | **Load Request** (stock onto van) | ✅ Built | `stock_request.create` | `stock_request.approve` | `erp_stock_requests` + workflow; UI `/field/van-sales/request` (`submitStockRequest`) | `/inventory/requests` |
| 2 | **New Customer Creation** | 🟡 Partial | `customer.create` | `customers.approve` | `createPendingCustomer` → `erp_customers.is_approved=false` / `approval_status` | inline in `/customers` (no rep form) |
| 3 | **Update Customer Data** | 🟡 Partial (flag) | `customers.manage` | `customers.approve` | Change-Request engine `erp_change_requests` (flag `KAKO_CHANGE_REQUESTS`) / legacy `erp_mdg_change_requests` | `/change-requests` or `/approvals/queue` (flag) |
| 4 | **Location Correction** (GPS) | 🟡 Partial | *(action policy)* | *(action policy)* | `requestCustomerGpsChange` → `erp_mdg_change_requests` (`field='gps'`) | **none** (no inbox) |
| 5 | **Credit Limit Request** | ✅ Built | `credit.request.create` | `credit.request.approve` | `erp_credit_limit_requests` + `erp_request_/decide_credit_limit`; UI credit-request-button | `/distribution/credit-requests` |
| 6 | **Reopen Day Request** | ✅ Built | `day.reopen.request` | `day.reopen.approve` | `erp_day_reopen_requests` + `erp_request_/decide_day_reopen`; reopen form | `/field/van-sales/reopen-approvals` |

**Key findings**
- **3 are fully built** (Load, Credit, Reopen) with create + approver inbox. They can go under a Requests hub **immediately** by linking, not rebuilding.
- **3 are partial**: New Customer (backend exists, no clean rep form), Update Customer Data (two engines, flag-gated), Location Correction (writes to `erp_mdg_change_requests` but has **no approver inbox**).
- **Backends are intentionally heterogeneous** — lightweight RPC (reopen), metadata change-engine (customer edits), workflow engine (credit), direct table+workflow (stock). **Consolidating them into one engine would be a large, risky rewrite and is NOT recommended.**

---

## 2. Recommendation — ONE Requests hub as a facade (reuse, don't rebuild)

Build a single **`/field/van-sales/requests`** page (salesman-facing) that is a thin
**facade** over the six existing backends. It does two things:

1. **Create:** a tile per request type → the type's existing create flow (reused).
2. **Track:** a "My requests" list per type (status: pending / approved / rejected /
   applied) read from each backend table, RLS-scoped to the salesman.

```
┌── Requests ───────────────────────────────┐
│  [📦 Load stock]      2 pending            │ → /field/van-sales/request (reuse)
│  [➕ New customer]    1 pending            │ → new thin rep form (Phase 2)
│  [✏️ Update customer] —                    │ → change-request form (Phase 2)
│  [📍 Fix location]    —                    │ → GPS form (Phase 2)
│  [💳 Credit limit]    1 pending            │ → credit request form (reuse backend)
│  [🔓 Reopen day]      (day is open)        │ → reopen form (reuse; contextual)
│                                            │
│  My recent requests · status …            │
└────────────────────────────────────────────┘
```

- **Each tile is gated** by the salesman's *create* permission (+ the feature flag
  where one exists), so a rep only sees the requests they can raise — no dead tiles.
- **No transaction or customer-selection entry points** live here (no sell / collect /
  return, no customer picker). Those stay in Today. Requests = non-transaction
  approvals only, exactly per your rule.
- **Reopen** is contextual: the tile shows the day state and opens the existing
  reopen form only when the day is closed (otherwise "available after End Day").

### What's reuse vs. what's new
| Type | Reuse (exists) | New (thin, this workstream) |
|---|---|---|
| Load | the whole `/field/van-sales/request` flow | just a hub tile + my-status read |
| Credit | `requestCreditLimit` RPC/backend | a small create form (pick customer · amount · reason) + my-status |
| Reopen | the reopen form + RPC | a hub tile (contextual) + my-status |
| New Customer | `createPendingCustomer` backend | a salesman create form + my-status |
| Update Customer Data | the change-request engine | a salesman "propose edit" form (whitelisted fields) + my-status |
| Location Correction | `requestCustomerGpsChange` + `erp_mdg_change_requests` | a form ("use my GPS"/enter lat,lng) **+ an approver inbox (the missing piece)** |

No new engine, schema, or transaction logic — only facade UI + a few thin create
forms + one missing approver inbox (GPS).

---

## 3. Navigation impact

| Element | Now | After |
|---|---|---|
| Van-salesman bottom nav | `Today · Van Stock · More` | **`Today · Van Stock · Requests · More`** |
| "Salesman App" (`/field/van-sales`) | redirects to `/today` | unchanged — **never reintroduced** as a tab |
| Requests | scattered (`/field/van-sales/request`, `/customers`, `/distribution/credit-requests`, embedded modals, reopen form) | **one hub** `/field/van-sales/requests` |
| Selling / customer entry | Today only | Today only — **no duplication in Requests** |
| More | secondary tools/settings | unchanged |

Implemented in the pure, unit-tested `resolveBottomNavTabs` (add a `requests`
candidate gated `field.sales` + `unifiedWorkspace`), so non-salesman roles and
flag-off tenants are unchanged.

---

## 4. Gaps to close (for full coverage)

1. **Location Correction has no approver inbox** — requests sit in
   `erp_mdg_change_requests` unseen. Needs a small approver surface (or route into
   the unified `/approvals/queue`).
2. **New Customer / Update Customer Data lack a salesman-focused form** — today the
   rep uses the back-office `/customers` manager. The hub needs thin rep forms.
3. **Status surfacing** — each backend has its own status; the hub's "My requests"
   must read each table (read-only) to show one consistent status list.
4. **Approver fragmentation** (out of scope for the *salesman* hub, noted for
   managers): reopen, credit, stock, change-requests each have their own inbox.
   The salesman hub does not need to unify these; a later manager-side pass can.

---

## 5. Recommended phasing (reuse-first, pilot, reversible)

- **Phase 1 — the hub + the 3 BUILT types.** New `/field/van-sales/requests` page +
  the **Requests** bottom-nav tab; wire **Load**, **Credit**, **Reopen** (create +
  my-status), each perm/flag-gated. Ship fast; everything is reuse.
- **Phase 2 — the 3 partial types.** Salesman forms for **New Customer**, **Update
  Customer Data** (change-request, whitelisted fields), **Location Correction**
  (use-my-GPS), plus the **missing GPS approver inbox**.
- **Phase 3 — promotion.** Fold the Requests tab into the **FMCG-default** promotion
  (business-type seed ON at creation + opt-in migrator for existing; rollback = flag
  OFF), same mechanism as the workspace/reopen designs.

Gating: reuse `platform.unified_salesman_workspace` (the Requests tab is part of the
unified experience) **or** a sibling `platform.salesman_requests` — see the open
question.

---

## 6. Open questions for sign-off
1. **Flag:** put the Requests tab under the existing
   `platform.unified_salesman_workspace`, or a dedicated `platform.salesman_requests`
   (lets Requests be enabled independently)? *Recommend: reuse the unified flag* —
   one switch for the whole unified salesman experience.
2. **Phase 1 scope:** ship the hub with the **3 built types** first (Load · Credit ·
   Reopen) and add the 3 partial ones in Phase 2? *Recommended* — fastest value, all
   reuse, no engine work.
3. **Location Correction approver:** new dedicated mini-inbox, or route GPS requests
   into the existing `/approvals/queue`? (Phase 2 decision.)

---

## 7. Decision (confirmed) + Phase 1 implementation

**Flag:** dedicated **`platform.salesman_requests`** (independent of the workspace).
**Phase 1 types:** Load Request · **Cash Handover** · Reopen Day. (Credit Limit
moves to Phase 2 with New Customer / Update Customer Data / Location Correction.)

**Implemented (Phase 1):**
- New `platform.salesman_requests` flag + `Requests` bottom-nav tab →
  **`Today · Van Stock · Requests · More`** (in the pure, unit-tested resolver).
- `/field/van-sales/requests` hub: tiles for **Load** (reuse `/field/van-sales/request`),
  **Cash handover** (new minimal request), **Reopen day** (links to Today), plus a
  **"My requests"** status list aggregating stock + cash + reopen requests.
- Minimal **Cash Handover request** (migration 0309): `erp_cash_handover_requests`
  + `erp_request_/decide_cash_handover` RPCs; perms `cash.handover.request`
  (salesman) / `cash.handover.confirm` (cashier/supervisor/accountant/admin);
  salesman can't confirm own; audited. Confirmer inbox
  `/field/van-sales/cash-handovers` + a tile on the (manager) van-sales hub.
- **Pluggable** by design: the hub renders a gated list of request types and the
  aggregator merges per-backend status — future types (credit, new customer,
  customer-data, GPS) plug into the same hub + "my requests".

> Cash Handover here is the **request/declaration** layer (declare amount →
> cashier confirms). The fuller cash-custody (per-day liability + multi-day
> allocation from the reopen design's Phase 2) will build on these confirmations.

## 8. Queued — Today JP route tabs (next refinement pass, NOT a blocker)
Inside the Today JP route list, add tabs **All · Remaining · Visited**:
- **Remaining** = planned customers not yet completed today; **Visited** =
  completed; **All** = full planned list with a status indicator per stop.
- Tapping **Complete Visit** moves a customer Remaining → Visited automatically;
  the **progress counter + coverage %** update accordingly.
- Today JP route customers first; keep it simple + mobile-friendly. Reuse
  `erp_today_journey` (planned) + `erp_visits` (visited) — no new engine.
Status: **queued** for the next refinement pass per the user (non-blocking).
