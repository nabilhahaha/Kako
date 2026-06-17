# Pilot Validation Runbook — FMCG Field Suite

Execution guide for **pilot validation against real roles**. The FMCG foundation
is **frozen and feature-complete** for this pilot — the goal here is *validation*,
not development. Use this runbook to drive each role through its real workflow,
capture friction, and feed a tight defect list.

**Scope of fixes during pilot:** only issues discovered during actual pilot usage,
within these guardrails — **no new modules, no new workflows, no architectural
changes.** Anything larger than a usability/navigation/missing-action/copy/report
gap is logged as *post-pilot* (alongside L1–L4), not fixed mid-pilot.

Pairs with:
- `Pilot-Setup-Checklist.md` — get the company configured & flags/policies on first.
- `Pilot-Readiness-Audit-2026.md` — the audit this validates against.

Focus areas (tag every finding with one): **Usability · Navigation · Missing
action · Workflow friction · Reporting gap.**

---

## 0. Before you start (one-time)

- [ ] Complete `Pilot-Setup-Checklist.md` (flags ON, policies configured & verified,
      opt-in permissions assigned, roles assigned).
- [ ] Seed demo data: `supabase/pilot/seed-return-approval-demo.sql`,
      `supabase/pilot/seed-day-close-demo.sql`.
- [ ] Provision one pilot user per role below (real login each, not super-admin —
      super-admin sees everything and masks permission gaps).
- [ ] Recommended demo policy: Supervisor closes the day; Financial Settlement and
      weekly Inventory Reconciliation are independent and **non-blocking**;
      carry-forward ON.

> Validate as the **role**, never as super-admin. The whole point is to confirm the
> permission-gated surfaces are correct; super-admin bypasses every gate.

---

## 1. Roles under test

| Role (login) | `BranchRole` | What this persona validates |
|---|---|---|
| Salesman | `salesman` | Field day: sell/collect, returns, End Day submit, custody |
| Supervisor | `supervisor` | Operational approvals: return + day-close review, reports |
| Warehouse | `warehouse_keeper` | Inventory reconciliation stage, load requests |
| Cashier | `cashier` | Financial settlement, collections, cash custody |
| Accountant | `accountant` | Settlement + financial/aging reports |
| Auditor | `auditor` | Read-only oversight: reports + audit trail (no actions) |

---

## 2. Expected navigation per role (verified against wiring)

Confirm each role sees **exactly** its surfaces — no hidden pages, no surprise
items. Derived from `ROLE_PERMISSIONS` (`permissions.ts`) × `NAV_SECTIONS`
(`navigation.ts`). "—" = intentionally NOT visible.

### Salesman
- Main/Sales: Today, Coaching, Route, Van Stock, Rep App, Journey, Field Offline,
  Invoices, Collections, Cashbox, **My Returns**, **Statement Hub**,
  **Daily Summary**, **Cash Custody**, Load Request.
- — Return Approvals, Day-Close Approvals/Settlement, Override Center, Reports group
  (no `reports.view`/approver perms). *Custody shows his own held cash + carry-forward.*

### Supervisor
- Supervisor Home, Manager Home, Reports Center, Approval Queue.
- **Return Approvals**, **Day-Close Approvals**, **Day-Close Settlement** (act),
  Statement Hub, Daily Summary, Cash Custody.
- **Reports group:** Return Report, Day-Close Report, Override History.
- — Override Center (opt-in `*.override`/`day.reopen` not granted by default).

### Warehouse
- Van Stock, **Day-Close Approvals** (Reconcile stage), **Day-Close Settlement**
  (reconcile tab — cash columns hidden, no `cash.view_outstanding`), Load Requests,
  Transfers, Stock Count, Warehouses, Van Reconciliation.
- **Day-Close Report** visible (via `day.close.reconcile`) — cash columns hidden.
- — Statement Hub, Daily Summary, Cash Custody, Return Report, Override History.

### Cashier
- Invoices, Collections, Cashbox, **Day-Close Approvals** (Settle), **Day-Close
  Settlement** (act — cash visible), **Cash Custody**, Statement Hub.
- **Day-Close Report** visible (via `day.close.settle`) — cash columns visible.
- — Daily Summary (no `reports.view`/`field.sales`), Return Report, Override History.

### Accountant
- Manager Home, Reports Center, Collections, Cashbox, Day-Close Approvals/Settlement
  (Settle), Cash Custody, Statement Hub, Daily Summary.
- **Reports group:** Return Report, Day-Close Report, Override History.
- Accounting: Chart, Vouchers, Journal, Financial Reports, Aging, Exports.

### Auditor (read-only)
- Manager Home, Reports Center, Statement Hub, Daily Summary.
- **Reports group:** Return Report, Day-Close Report, Override History.
- Credit limit + cash columns **visible** (oversight); export allowed.
- — All *act* surfaces: Approvals, Settlement, Override Center, Cash Custody
  (his-custody view; auditor has no field/collect role). Confirm **no action
  buttons** anywhere — read + export only.

> Friction check for each role: is anything in this list missing from the sidebar,
> or is anything present that the role should not see? Either is a **Navigation**
> finding.

---

## 3. Per-role walkthrough scripts

Each step: do the action, then record Result + any finding (focus-area tag).

### 3A. Salesman — a full field day
1. Open **Today** → confirm Cash Custody summary card (5 figures; warning badge if
   outstanding > 0; escalation badge if aged past threshold).
2. **Sell**: create an invoice; **Collect** a payment.
3. **Return — auto path**: create a saleable return ≤ policy threshold → confirm it
   posts immediately (no approval).
4. **Return — approval path**: create a damaged / > threshold return → confirm it
   becomes *Pending* and appears in **My Returns**.
5. **Statement Hub**: search a customer; check balance/overdue/oldest-due, color
   badge, quick filters; start a collection; print/share a statement PDF.
6. **End Day**: tap End Day → confirm day **locks** to *Pending Supervisor*, NOT
   fully closed. Confirm he **cannot** act on his own approval (SoD/self-block).
7. **Withdraw**: if no stage has acted, withdraw the End Day → confirm it reopens.
8. **Cash Custody** page: confirm held cash + previous-day carry-forward.
- Friction watch: too many taps to End Day? Return reason discoverable? Custody
  numbers legible on mobile?

### 3B. Supervisor — operational approvals
1. **Return Approvals**: open the pending return → approve one, reject one (reason
   required) → confirm rep's My Returns reflects both.
2. **Day-Close Approvals**: open the salesman's pending day → approve the Supervisor
   stage → confirm **Day = Closed** while **Cash = Pending/Partial** and **Inventory
   = Not Due Yet** (non-blocking close).
3. Confirm SoD: a stage the supervisor is not assigned to is not actionable by them.
4. **Reports group**: open Return Report (counts, SLA: pending >24h/>48h, avg approve
   time) and Day-Close Report (outstanding aging).
- Friction watch: is the "closed but unsettled" state clearly communicated, not
  alarming? Is the pending queue ordered by priority/age?

### 3C. Warehouse — inventory reconciliation
1. **Day-Close Approvals / Settlement** → Reconcile the day's stock: record counted
   qty → confirm variance is recorded and **carries forward** (status → Reconciled;
   never blocks the close under demo policy).
2. Confirm **no cash columns** are visible anywhere (no `cash.view_outstanding`).
3. **Load Requests**: approve/adjust a rep's load request.
- Friction watch: can warehouse tell which days are *Not Due Yet* vs *Pending* for
  reconciliation? Is variance entry fast?

### 3D. Cashier — financial settlement
1. **Day-Close Settlement**: settle the expected cash —
   - Full settlement → Cash = Settled.
   - **Partial** settlement → outstanding recorded → confirm it surfaces as the
     rep's carried **Cash in Custody** next day (+ escalation if aged).
2. **Day-Close Report**: confirm cash + outstanding aging visible (has
   `cash.view_outstanding`).
3. **Collections / Cashbox**: record a collection.
- Friction watch: is "settle part now, rest carries forward" obvious? Is the
  expected-vs-received delta shown before confirming?

### 3E. Accountant — settlement + financial reporting
1. Repeat a settlement (3D) from the accountant login → confirm parity with cashier.
2. **Reports group**: Return Report + Day-Close Report — counts, outstanding aging,
   SLA all populated.
3. **Accounting**: open Aging, Financial Reports, Exports → confirm figures reconcile
   with the day-close outstanding.
- Friction watch: do day-close outstanding figures tie to Aging? Any double-entry or
  missing export column?

### 3F. Auditor — read-only oversight
1. Open every Reports-group surface + Statement Hub + Daily Summary.
2. Confirm **read + export only** — no approve/reject/settle/override/reopen buttons
   anywhere.
3. Confirm credit limit and cash columns are **visible** (oversight grant), and the
   **Override History** lists every override with actor + reason + timestamp.
4. Spot-check `erp_audit_logs`: submit/approve/reject/settle/reconcile/override/reopen
   all present with actor + reason.
- Friction watch: can the auditor trace one return and one day-close end-to-end from
  the reports alone? Any action that is **not** in the audit trail is a finding.

---

## 4. Cross-cutting checks (all roles)

- [ ] **Navigation:** sidebar matches §2 exactly per role (nothing hidden, nothing leaked).
- [ ] **Arabic/English parity:** switch locale — labels present, layout RTL-correct.
- [ ] **Mobile:** field roles (salesman) usable on a phone; bottom-nav tabs correct.
- [ ] **Empty states:** no van / no pending items / no custody → friendly message, not blank.
- [ ] **Permission visibility:** credit hidden for salesman & cashier; cash hidden for
      warehouse; auditor read-only.
- [ ] **No dead ends:** every page reachable from nav; every workflow has its next action.

---

## 5. Defect capture (use for every finding)

| # | Role | Focus area | Surface / page | What happened | Expected | Severity | Disposition |
|---|---|---|---|---|---|---|---|
| | | Usability / Navigation / Missing action / Friction / Reporting | | | | Blocker / High / Med / Low | Fix in pilot / Post-pilot |

**Disposition rule (keep the foundation frozen):**
- **Fix in pilot** — usability copy, nav visibility/labels, a missing button that
  wires an *existing* action, a missing column on an *existing* report, an i18n gap.
- **Post-pilot** — anything needing a new module, new workflow, schema/RPC change, or
  policy-model change. Log it next to L1–L4; do **not** fix mid-pilot.

> When in doubt about whether a fix is in-scope, escalate the call rather than
> assume — a fix that quietly adds a workflow violates the freeze.

---

## 6. Exit criteria

- [ ] All six roles completed §3 end-to-end without a Blocker.
- [ ] Every finding logged in §5 with focus area + disposition.
- [ ] In-pilot fixes shipped; post-pilot items queued (with L1–L4).
- [ ] Audit trail verified complete (§3F.4).
- [ ] Pilot owner sign-off: ____________________  Date: __________
