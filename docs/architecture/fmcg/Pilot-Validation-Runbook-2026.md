# Per-Role Validation Runbook — FMCG Field Suite

Execution guide for a **structured FMCG pilot using real users and real
workflows.** The FMCG foundation is **frozen and feature-complete** for this
pilot. This document is **documentation and pilot-execution preparation only** —
**no new features, no workflow changes, no architecture changes.**

Goal: capture **usability, navigation, permission, reporting, and workflow**
issues without introducing new development. Only issues discovered during pilot
usage are fixed, and only within the freeze guardrails (see *Defect disposition*).

**Companion docs**
- `Pilot-Setup-Checklist.md` — configure the company (flags, policies, opt-in
  permissions, role assignment) **before** running this.
- `Pilot-Readiness-Audit-2026.md` — the readiness audit this validates against.
- `Pilot-Launch-Package` / `Reference-Company` docs — demo tenant + dry-run.

**Source of truth for the matrices below:** `src/lib/erp/permissions.ts`
(`ROLE_PERMISSIONS`) × `src/lib/erp/navigation.ts` (`NAV_SECTIONS`). Every
"visible / hidden / allowed / blocked" line is derived from that wiring, not
assumed.

---

## 0. Pre-flight (one-time, before any role testing)

- [ ] `Pilot-Setup-Checklist.md` complete: feature flags ON, Return + Day-Close
      policies configured **and verified**, opt-in permissions assigned, roles
      assigned to named pilot users.
- [ ] Demo data seeded: `seed-return-approval-demo.sql`, `seed-day-close-demo.sql`.
- [ ] **One real login per role** below — never test as super-admin (it bypasses
      every gate and masks the exact permission behavior we are validating).
- [ ] Recommended demo policy: **Supervisor closes the day**; Financial Settlement
      and weekly Inventory Reconciliation are **independent and non-blocking**;
      carry-forward ON; custody escalation threshold set.
- [ ] Two devices ready: a phone (field roles) and a desktop (back-office roles).

> **Validate as the role.** The pilot proves the permission-gated surfaces are
> correct. If you log in as super-admin you will see everything and prove nothing.

---

## 1. How to read the per-role spec

Each role below lists nine facets. Legend:
- **Expected navigation** — sidebar sections/items the role should see.
- **Expected visible pages** — key destinations the role can open.
- **Expected hidden pages** — destinations the role must NOT see (negative test).
- **Allowed actions** — operations the role can perform.
- **Blocked actions** — operations the role must be prevented from performing.
- **Approval capabilities** — which approval/decision stages the role can act on.
- **Reports visibility** — which reports/analytics the role can open (+ data masking).
- **Print / Share** — `documents.print` / `documents.share` / `documents.export`.
- **Override** — `returns.override` / `day.close.override` / `day.reopen`.

`✓` = present/allowed · `—` = absent/blocked (intentional).

---

## 2. Role specifications

### 2.1 Salesman  (`salesman`)
**Persona:** field rep — sells, collects, raises returns, submits End Day, holds cash.

| Facet | Detail |
|---|---|
| Expected navigation | Today; Coaching; Route; Van Stock; Rep App; Journey / Today Journey; Field Offline; Invoices; Collections; Cashbox; My Returns; **Statement Hub**; **Daily Summary**; **Cash Custody**; Load Request. |
| Expected visible pages | `/today`, `/field/route`, `/field/stock`, `/rep`, `/sales/invoices`, `/collections`, `/cashbox`, `/field/van-sales/my-returns`, `/field/van-sales/statement`, `/field/van-sales/summary`, `/field/van-sales/cash-custody`, `/inventory/requests`. |
| Expected hidden pages | Return Approvals, Day-Close Approvals, Day-Close Settlement, Override Center, Reports group (Return/Day-Close Report, Override History), Settings, Accounting. |
| Allowed actions | Create invoice; collect payment; create return (auto & approval paths); start collection; **submit** End Day; **withdraw** End Day (only if no stage acted); request stock load; request cash handover; raise customer request. |
| Blocked actions | Approve/reject returns; act on any day-close stage; settle cash; reconcile stock; override; reopen; edit policies; view credit limit. |
| Approval capabilities | — (submitter only). |
| Reports visibility | Daily Summary + Statement Hub (via `field.sales`, operational — not report-gated). No Reports group, no Reports Center. Sees **own** custody only. |
| Print / Share | print ✓ · share ✓ · export ✓ |
| Override | returns — · day-close — · reopen — |

### 2.2 Supervisor  (`supervisor`)
**Persona:** operational approver — return + day-close review, oversight reports.

| Facet | Detail |
|---|---|
| Expected navigation | Supervisor Home; Manager Home; Reports Center; Approval Queue; Return Approvals; Day-Close Approvals; Day-Close Settlement; Statement Hub; Daily Summary; Cash Custody; **Reports group** (Return Report, Day-Close Report, Override History). |
| Expected visible pages | `/supervisor`, `/approvals/queue`, `/field/van-sales/approvals`, `/field/van-sales/day-close-approvals`, `/field/van-sales/day-close-settlement`, `/field/van-sales/approvals/reports`, `/field/van-sales/day-close-report`, `/field/van-sales/override-center/history`. |
| Expected hidden pages | **Override Center** (act) — opt-in not granted; Settings / policy consoles; Accounting posting. |
| Allowed actions | Approve/reject returns (reason on reject); act Supervisor / Reconcile / Settle stages of day close (per assignment + SoD); approve out-of-route; approve day-close exception; approve day-reopen request; confirm cash handover; approve customer request. |
| Blocked actions | Override return policy; force-close; reopen a closed day; edit company policies; post journals. |
| Approval capabilities | returns.approve/reject ✓ · day.close.supervisor/reconcile/settle ✓ · day.approve_close_exception ✓ · day.reopen.approve ✓ · stock.transfer.approve ✓ |
| Reports visibility | Full Reports group + Reports Center + Manager Home. Cash + credit visible (`cash.view_outstanding`, `customers.view_credit`). |
| Print / Share | print ✓ · share ✓ · export ✓ |
| Override | returns — · day-close — · reopen — (grantable, not default) |

### 2.3 Warehouse  (`warehouse_keeper`)
**Persona:** inventory reconciliation + load fulfilment. No cash visibility.

| Facet | Detail |
|---|---|
| Expected navigation | Van Stock; Products; Stock; Low-Stock; Transfers; Load Requests; Stock Count; Warehouses; Van Reconciliation; Day-Close Approvals (Reconcile); Day-Close Settlement (reconcile tab); **Day-Close Report** (cash hidden). |
| Expected visible pages | `/inventory`, `/inventory/requests`, `/inventory/count`, `/inventory/transfers`, `/warehouses`, `/field/van-reconciliation`, `/field/van-sales/day-close-approvals`, `/field/van-sales/day-close-report`. |
| Expected hidden pages | Statement Hub, Daily Summary, Cash Custody, Return Report, Override History, Override Center, Collections/Cashbox, Settings, Accounting. |
| Allowed actions | Approve/adjust load requests; transfer stock; stock count/adjust; **reconcile** day-close stock (record count → variance carries forward). |
| Blocked actions | Settle cash; view cash/custody figures; approve returns; override; reopen; edit policies. |
| Approval capabilities | day.close.reconcile ✓ · stock_request.approve/adjust ✓ · stock.transfer.approve ✓ · reconciliation.manage ✓ |
| Reports visibility | Day-Close Report only (via `day.close.reconcile`) — **cash columns hidden** (no `cash.view_outstanding`). No Reports Center, no Return Report. |
| Print / Share | print ✓ · share **—** · export ✓ |
| Override | returns — · day-close — · reopen — |

### 2.4 Cashier  (`cashier`)
**Persona:** financial settlement + collections + cash custody confirmation.

| Facet | Detail |
|---|---|
| Expected navigation | Invoices; Collections; Cashbox; Day-Close Approvals (Settle); Day-Close Settlement; Cash Custody; Statement Hub; **Day-Close Report** (cash visible). |
| Expected visible pages | `/sales/invoices`, `/collections`, `/cashbox`, `/field/van-sales/day-close-settlement`, `/field/van-sales/cash-custody`, `/field/van-sales/statement`, `/field/van-sales/day-close-report`. |
| Expected hidden pages | Daily Summary (no `reports.view`/`field.sales`), Return Report, Override History, Override Center, Reports Center, Settings, Accounting posting. |
| Allowed actions | Record collection; **settle** day-close cash (full / **partial** → outstanding carries forward); confirm cash handover; sell/invoice. |
| Blocked actions | Approve returns; reconcile stock; override; reopen; view customer credit limit; edit policies. |
| Approval capabilities | day.close.settle ✓ · cash.handover.confirm ✓ |
| Reports visibility | Day-Close Report (via `day.close.settle`) — **cash + outstanding aging visible** (`cash.view_outstanding`). No Reports group beyond that; no Reports Center. |
| Print / Share | print ✓ · share ✓ · export ✓ |
| Override | returns — · day-close — · reopen — |

### 2.5 Accountant  (`accountant`)
**Persona:** settlement + financial/aging reporting; ties day-close cash to the GL.

| Facet | Detail |
|---|---|
| Expected navigation | Manager Home; Reports Center; Collections; Cashbox; Day-Close Approvals/Settlement (Settle); Cash Custody; Statement Hub; Daily Summary; **Reports group**; Accounting (Chart, Vouchers, Journal, Financial Reports, Aging, Exports). |
| Expected visible pages | `/manager`, `/reports`, `/field/van-sales/day-close-settlement`, `/field/van-sales/day-close-report`, `/field/van-sales/approvals/reports`, `/accounting/aging`, `/accounting/reports`, `/exports`. |
| Expected hidden pages | Override Center, Settings / policy consoles, Inventory management, Return Approvals (act). |
| Allowed actions | Settle day-close cash; confirm cash handover; post journals/vouchers; record collection; export reports. |
| Blocked actions | Approve returns; reconcile stock; override; reopen; edit policies. |
| Approval capabilities | day.close.settle ✓ · cash.handover.confirm ✓ · accounting.post ✓ |
| Reports visibility | Full Reports group (Return, Day-Close, Override History — read) + Accounting reports + Aging. Cash + credit visible. |
| Print / Share | print ✓ · share ✓ · export ✓ |
| Override | returns — · day-close — · reopen — |

### 2.6 Auditor  (`auditor`)
**Persona:** read-only oversight across approvals, settlement, and the audit trail.

| Facet | Detail |
|---|---|
| Expected navigation | Manager Home; Reports Center; Statement Hub; Daily Summary; **Reports group** (Return Report, Day-Close Report, Override History). |
| Expected visible pages | `/manager`, `/reports`, `/field/van-sales/statement`, `/field/van-sales/summary`, `/field/van-sales/approvals/reports`, `/field/van-sales/day-close-report`, `/field/van-sales/override-center/history`. |
| Expected hidden pages | All **act** surfaces: Return Approvals, Day-Close Approvals/Settlement, Override Center, Cash Custody (own-custody view; auditor has no field/collect role), Settings. |
| Allowed actions | View any report; trace any return / day-close end-to-end; export reports; read the audit trail. |
| Blocked actions | **Any** mutation — approve, reject, settle, reconcile, override, reopen, edit. Confirm **no action buttons render** anywhere. |
| Approval capabilities | — (read-only). |
| Reports visibility | Full Reports group + Statement Hub + Daily Summary. **Cash + credit columns visible** (oversight grant). Override History shows actor + reason + timestamp for every override. |
| Print / Share | print **—** · share **—** · export ✓ |
| Override | returns — · day-close — · reopen — |

### 2.7 Branch Manager  (`branch_manager`)
**Persona:** branch operations + approvals + reports. NOT a settings/policy admin.

| Facet | Detail |
|---|---|
| Expected navigation | Supervisor Home; Manager Home; Reports Center; Approval Queue; Return Approvals; Day-Close Approvals/Settlement; Statement Hub; Daily Summary; Cash Custody; **Reports group**; Customers; Customer Transfer; Inventory (Products, Stock, Transfers, Load Requests, Stock Count, Warehouses); Purchasing (Suppliers, POs, Supplier Returns). |
| Expected visible pages | `/supervisor`, `/manager`, `/approvals/queue`, `/field/van-sales/approvals`, `/field/van-sales/day-close-approvals`, `/field/van-sales/day-close-settlement`, Reports-group pages, `/customers`, `/inventory/requests`, `/purchases/orders`. |
| Expected hidden pages | **Override Center** (act) — grantable, not default; Settings / policy consoles (`/settings/*`); platform/governance; **Van Reconciliation** page (no `reconciliation.*`). |
| Allowed actions | Approve/reject returns; act all day-close stages (Supervisor/Reconcile/Settle); approve out-of-route + day-close exception + day-reopen request; confirm cash handover; manage customers + inventory + purchasing; transfer customers. |
| Blocked actions | Override return policy; force-close; reopen a closed day; edit company policies (return/day-close/features); view audit trail (`audit.view`). |
| Approval capabilities | returns.approve/reject ✓ · day.close.supervisor/reconcile/settle ✓ · day.approve_close_exception ✓ · day.reopen.approve ✓ · stock.transfer.approve ✓ · stock_request.approve ✓ · customer.request.approve ✓ |
| Reports visibility | Full Reports group + Reports Center + Manager Home. Cash + credit visible. |
| Print / Share | print ✓ · share ✓ · export ✓ |
| Override | returns — · day-close — · reopen — (this is the role that typically RECEIVES the opt-in override grant in §3 of the setup checklist; verify both states if granted). |

### 2.8 Company Admin  (`admin` — tenant super-admin)
**Persona:** apex tenant role — configures policies/flags and holds every permission.

| Facet | Detail |
|---|---|
| Expected navigation | Everything the company's modules unlock, including **Settings → Governance** (Return Policy, Day-Close Policy, Features, Audit Log, Authz/Action Policies), Organization (Branches, Staff, Users, Permissions), **Override Center**, all Reports. |
| Expected visible pages | All FMCG surfaces + `/settings/returns`, `/settings/day-close`, `/settings/features`, `/settings/audit-log`, `/field/van-sales/override-center`. |
| Expected hidden pages | Vendor/platform-owner-only surfaces (`/platform/*` owner items) — those belong to the VANTORA vendor tier, not a tenant admin. |
| Allowed actions | All tenant actions + **configure** Return/Day-Close policies, toggle feature flags, assign permissions/roles, and (by virtue of ALL perms) **override / force-close / reopen** with reason. |
| Blocked actions | Cross-tenant / vendor platform administration. |
| Approval capabilities | All approval stages. |
| Reports visibility | All reports + audit trail (`audit.view`). |
| Print / Share | print ✓ · share ✓ · export ✓ |
| Override | returns ✓ · day-close ✓ · reopen ✓ — **inherent to the apex role** (the intended exception to "no override by default"). Every override still requires a reason and is audited. |

> **Negative-test reminder:** for each role, opening an "Expected hidden page" by
> direct URL must **redirect / 404 / block**, not render. A hidden item that is
> reachable by URL is a permission defect, not just a nav gap.

---

## 3. Step-by-step validation scripts

Mark **Pass/Fail** and add **Notes** for every step. A failed step → log it in the
Defect Capture template (§4). Scripts assume the seeded demo policy.

### 3.1 Salesman
| # | Action | Expected Result | Pass/Fail | Notes |
|---|---|---|---|---|
| S1 | Log in; open Today | Sees custody summary card (5 figures); warning badge if outstanding > 0; escalation badge if aged | | |
| S2 | Inspect sidebar | Matches §2.1 nav exactly; no Approvals/Settlement/Override/Reports group | | |
| S3 | Create an invoice | Posts; print/share/continue offered (never auto-prints) | | |
| S4 | Collect a payment | Recorded; balance updates | | |
| S5 | Create saleable return ≤ threshold | Auto-posts, no approval | | |
| S6 | Create damaged / > threshold return | Becomes Pending; appears in My Returns | | |
| S7 | Statement Hub: search a customer | Balance/overdue/oldest-due + color badge; quick filters work; credit limit **hidden** | | |
| S8 | Statement Hub: print / share statement | PDF prints/shares | | |
| S9 | Tap End Day | Day **locks → Pending Supervisor**, NOT fully closed | | |
| S10 | Try to approve own End Day | Blocked (SoD / self-action) | | |
| S11 | Withdraw End Day (no stage acted) | Reopens to open day | | |
| S12 | Open Cash Custody page | Shows held cash + previous-day carry-forward | | |
| S13 | Direct-URL `/field/van-sales/day-close-approvals` | Redirect/blocked | | |

### 3.2 Supervisor
| # | Action | Expected Result | Pass/Fail | Notes |
|---|---|---|---|---|
| SV1 | Inspect sidebar | Matches §2.2; Reports group present; **no Override Center** | | |
| SV2 | Return Approvals: approve one | Posts; rep's My Returns shows approved | | |
| SV3 | Return Approvals: reject one | Reason required; rep sees rejected + reason | | |
| SV4 | Day-Close Approvals: approve Supervisor stage | **Day = Closed** while Cash = Pending/Partial, Inventory = Not Due Yet (non-blocking) | | |
| SV5 | Try a stage not assigned to you | Not actionable (SoD/assignment) | | |
| SV6 | Return Report | Counts + SLA (pending >24h/>48h, avg approve time) populate | | |
| SV7 | Day-Close Report | Outstanding aging + cash visible | | |
| SV8 | Override History | Lists overrides with actor + reason (read-only) | | |
| SV9 | Direct-URL `/field/van-sales/override-center` | Redirect/blocked (no override grant) | | |

### 3.3 Warehouse
| # | Action | Expected Result | Pass/Fail | Notes |
|---|---|---|---|---|
| W1 | Inspect sidebar | Matches §2.3; no Statement/Summary/Custody; no cash anywhere | | |
| W2 | Reconcile day stock: record count | Variance recorded; status → Reconciled; carries forward; never blocks close | | |
| W3 | Look for any cash figure | None visible (no `cash.view_outstanding`) | | |
| W4 | Day-Close Report | Opens; **cash columns hidden** | | |
| W5 | Load Requests: approve/adjust | Quantities approved/adjusted | | |
| W6 | Try to settle cash | Blocked / not offered | | |
| W7 | Confirm share is unavailable | Print/Export only; no Share action | | |

### 3.4 Cashier
| # | Action | Expected Result | Pass/Fail | Notes |
|---|---|---|---|---|
| C1 | Inspect sidebar | Matches §2.4; Day-Close Report present; **no Daily Summary** | | |
| C2 | Day-Close Settlement: full settle | Cash = Settled; delta shown before confirm | | |
| C3 | Day-Close Settlement: **partial** settle | Outstanding recorded → surfaces as rep's carried custody next day (+ escalation if aged) | | |
| C4 | Day-Close Report | Cash + outstanding aging visible | | |
| C5 | Record a collection | Posted | | |
| C6 | Try to view a customer credit limit | Hidden (no `customers.view_credit`) | | |
| C7 | Try to reconcile stock | Blocked / not offered | | |

### 3.5 Accountant
| # | Action | Expected Result | Pass/Fail | Notes |
|---|---|---|---|---|
| A1 | Inspect sidebar | Matches §2.5; Reports group + Accounting present | | |
| A2 | Settle a day-close (parity with cashier) | Same behavior as C2/C3 | | |
| A3 | Return + Day-Close Reports | Counts, outstanding aging, SLA populated | | |
| A4 | Aging report | Ties to day-close outstanding figures | | |
| A5 | Exports | Export generates; columns complete | | |
| A6 | Try to reconcile stock / override | Blocked | | |

### 3.6 Auditor
| # | Action | Expected Result | Pass/Fail | Notes |
|---|---|---|---|---|
| AU1 | Inspect sidebar | Matches §2.6; only read/report surfaces | | |
| AU2 | Open every Reports-group page | All open; cash + credit visible | | |
| AU3 | Look for any action button | **None render** (read-only) | | |
| AU4 | Override History | Every override shows actor + reason + timestamp | | |
| AU5 | Trace one return + one day-close end-to-end from reports | Fully traceable | | |
| AU6 | Try to export | Export works (export-only grant) | | |
| AU7 | Try to print / share | Not offered (no print/share grant) | | |
| AU8 | Spot-check `erp_audit_logs` | submit/approve/reject/settle/reconcile/override/reopen all present | | |

### 3.7 Branch Manager
| # | Action | Expected Result | Pass/Fail | Notes |
|---|---|---|---|---|
| BM1 | Inspect sidebar | Matches §2.7; Reports group present; **no Override Center**, **no Settings** | | |
| BM2 | Approve a return + a day-close stage | Both succeed | | |
| BM3 | Approve a day-reopen request | Succeeds (`day.reopen.approve`) | | |
| BM4 | Manage a customer + a load request | Both succeed | | |
| BM5 | Direct-URL `/settings/day-close` | Redirect/blocked (no `settings.workflow_policy`) | | |
| BM6 | Direct-URL `/field/van-sales/override-center` | Redirect/blocked (unless override granted — then re-test granted state) | | |
| BM7 | (If override granted in setup §3) Override Center | Visible; force actions require reason + audited | | |

### 3.8 Company Admin
| # | Action | Expected Result | Pass/Fail | Notes |
|---|---|---|---|---|
| CA1 | Inspect sidebar | Full nav incl Settings → Governance + Override Center | | |
| CA2 | Open Return Policy + Day-Close Policy | Editable; changes persist & re-resolve | | |
| CA3 | Toggle a feature flag | Surface appears/disappears in nav accordingly | | |
| CA4 | Assign override permission to Branch Manager | BM gains Override Center (re-test BM7) | | |
| CA5 | Override Center: force approve a return | Requires reason; audited; appears in Override History | | |
| CA6 | Force-close / reopen a day | Requires reason; audited | | |
| CA7 | Open Audit Log | Full trail visible | | |
| CA8 | Direct-URL a `/platform` owner page | Blocked (vendor tier, not tenant) | | |

---

## 4. Defect capture template

Log one row per finding. Tag focus area in Notes (Usability / Navigation /
Permission / Reporting / Workflow).

| Field | Entry |
|---|---|
| **Role** | (Salesman / Supervisor / Warehouse / Cashier / Accountant / Auditor / Branch Manager / Company Admin) |
| **Screen** | (page / route) |
| **Action** | (what the tester did) |
| **Expected** | (per this runbook) |
| **Actual** | (what happened) |
| **Severity** | Blocker / High / Medium / Low |
| **Screenshot** | (attach / link) |
| **Recommendation** | (proposed fix + in-pilot vs post-pilot) |

**Defect disposition (keeps the foundation frozen):**
- **Fix in pilot** — usability copy, nav visibility/labels, an i18n gap, a missing
  button that wires an **existing** action, a missing column on an **existing**
  report, a permission gate that's wrong vs §2.
- **Post-pilot** — anything needing a new module, new workflow, schema/RPC change,
  or policy-model change. Log next to L1–L4; do **not** fix mid-pilot. If unsure
  whether a fix crosses the line, **escalate the call** before coding it.

---

## A. Pilot Execution Order

Run roles in dependency order so each stage has upstream data to act on:

1. **Company Admin** — verify policies/flags resolve; assign opt-in permissions
   (§CA1–CA3). *Gate: setup correct before anyone transacts.*
2. **Salesman** — generate the day's transactions: sell, collect, returns (both
   paths), submit End Day (§3.1).
3. **Supervisor** — approve returns; approve the Supervisor stage → day closes
   (§3.2).
4. **Warehouse** — reconcile the day's stock (§3.3).
5. **Cashier** — settle cash (full + partial → carry-forward) (§3.4).
6. **Accountant** — reconcile day-close outstanding to Aging/GL; exports (§3.5).
7. **Branch Manager** — re-run approvals at branch scope; verify no Settings/Override
   by default; (optional) test granted-override state (§3.7).
8. **Auditor** — final read-only pass: trace everything end-to-end; verify the audit
   trail is complete (§3.6).

Repeat the loop for **2–3 business days** so carry-forward custody and escalation
badges accrue real aging.

---

## B. Pilot Success Criteria

- **Navigation:** every role's sidebar matches §2 (nothing hidden that should show,
  nothing leaked that should not) — incl. direct-URL negative tests.
- **Permissions:** all "Blocked actions" blocked; credit hidden for salesman/cashier;
  cash hidden for warehouse; auditor fully read-only.
- **Workflow:** full loop completes — sell → collect → return (auto + approval) →
  End Day submit → supervisor close (non-blocking cash/inventory) → partial settle →
  carry-forward → reconcile → override/reopen (reason + audited).
- **Reporting:** Return + Day-Close reports show counts, SLA, outstanding aging;
  Aging ties to day-close outstanding; cash masked correctly per role.
- **Print/Share:** matrix in §2 holds (warehouse no-share; auditor export-only).
- **Audit:** every mutation (submit/approve/reject/settle/reconcile/override/reopen)
  present in `erp_audit_logs` with actor + reason.
- **Usability:** no Blocker-severity friction; field flows usable on a phone in
  ar + en (RTL correct).

---

## C. Go / No-Go Checklist

| # | Check | Status |
|---|---|---|
| G1 | All 8 role scripts (§3) completed end-to-end | ☐ |
| G2 | Zero **Blocker** defects open | ☐ |
| G3 | Zero **High** permission/visibility defects open (or accepted with mitigation) | ☐ |
| G4 | Navigation matches §2 for all roles (incl. URL negative tests) | ☐ |
| G5 | Full workflow loop green across 2–3 days incl. carry-forward + escalation | ☐ |
| G6 | Reports reconcile (Day-Close outstanding ↔ Aging) | ☐ |
| G7 | Audit trail complete & override reasons present | ☐ |
| G8 | ar/en parity + mobile usability confirmed for field roles | ☐ |
| G9 | All in-pilot fixes shipped; post-pilot items logged with L1–L4 | ☐ |
| G10 | Rollback verified (flags default OFF disables the suite cleanly) | ☐ |
| — | **Decision:** GO ☐ / NO-GO ☐ — Owner: __________ Date: ______ | |

---

## D. Known deferred items (L1–L4)

Accepted, out of scope for this pilot, scheduled **post-pilot** (do not fix
mid-pilot — they don't block validation):

- **L1 — Retire dangling `day.close.reopen` permission.** A legacy reopen
  permission still granted to some roles but superseded by the Override Center's
  `day.reopen`. Cleanup only; no behavior change expected.
- **L2 — Enforce or reserve `documents.print`.** `print` is granted but not yet
  enforced at the action layer (share/export are). Decide: enforce it or reserve it.
- **L3 — Legacy orphan surfaces.** `reopen-approvals`, `cash-handovers`, and the
  coverage-exception close path predate the unified Day-Close/Override flows; retire
  or fold them in.
- **L4 — Consolidate the two reopen mechanisms.** `day.reopen.request/approve`
  (governed request) and `day.reopen` (Override Center) coexist; unify into one
  documented path.

> If pilot usage surfaces a **new** issue that would require crossing the freeze
> line, log it here as a candidate alongside L1–L4 rather than implementing it
> during the pilot.
