# FMCG Pilot Readiness Report

**Tenant:** pilot `612af0bd-…` (Supabase staging `rsjvgehvastmawzwnqcs`). **Date:** 2026-06-15.
**Branch:** `claude/fmcg-sell-collect-loop` (PR #311). **Scope:** staging only — no production rollout.

Pilot enforcement flags ON (pilot tenant only; default OFF everywhere):
`platform.collect_in_sell`, `platform.day_reopen`, `platform.visit_driven_route`,
`platform.unified_salesman_workspace`, `platform.salesman_requests`,
`platform.rpc_authz_enforcement` (D), `platform.action_authz_enforcement` (F).

---

## 1. Navigation Audit — results

- **Smart three-tier Back** (`back-link.tsx`): History → Parent page → Role home. Applied to every
  operational screen; parents assigned per screen (not just My Day). Documented in
  `docs/NAVIGATION-HIERARCHY.md`.
- **My Day default landing for FIELD roles only** (salesman/van/merchandiser); office roles keep
  their dashboards (`resolveHomePath`).
- **Zero dead-ends / orphans:** approver inboxes + readiness reachable from the van-sales hub;
  End Day deep-links to the close-day workflow (`/field/journey?endday=1`), not a read-only screen.
- **Status: PASS.** Per-screen table delivered; `tsc`/tests/build green.

## 2. Role & Permission Audit — results

- Authoritative source confirmed: runtime resolves `ctx.permissions` from
  `erp_company_role_permissions` (per-tenant); code `ROLE_PERMISSIONS` is seed/legacy fallback.
- Pilot: 7 users, one role each (no privilege aggregation). RLS enabled on every key table
  (tenant-scoped). No table-driven data scopes / role limits.
- **Findings (documented in `docs/ROLE-PERMISSION-AUDIT.md`):**
  - **HIGH — Separation of duties:** `warehouse_keeper` self-approves stock adjustments/transfers
    (`inventory.adjust`+`inventory.adjustment.approve`, `stock.transfer`+`stock.transfer.approve`);
    `accountant` self-approves vouchers (`accounting.post`+`accounting.voucher.approve`) and holds
    `sales.invoice.cancel`+`sales.payment.writeoff`. **NOT yet remediated.**
  - **MEDIUM — Code↔DB drift:** 12 permission strings enforced in DB but absent from the code
    `Permission` union (incl. invoice-cancel, payment-writeoff, voucher-approve, change_requests.*,
    trade_spend). **NOT yet remediated** (Section E).
  - **MEDIUM — Missing grants:** `visit.override_gps` / `day.reopen.override` held by no role
    (apex-only); company **admin lacks** `assortment.manage`/`survey.manage`/`grade.manage` (retail
    -exec config). Owner decisions pending.
  - **LOW:** cross-vertical permission bleed (fashion/clinic on generic roles).
- **Status: COMPLETE (report).** Remediation: D + F done; SoD + drift + missing-grants OPEN.

## 3. Section D — sensitive-RPC enforcement — results

- **Implemented & validated.** Migration 0314 adds a flag-gated `erp_guard_rpc` to 10 RPCs:
  `erp_issue_invoice` (sales.sell), `erp_record_payment`/`erp_settle_collection` (sales.collect),
  `erp_record_supplier_payment` (accounting.post|suppliers.manage), `erp_post_*_voucher`
  (accounting.post), `erp_approve_stock_request` (stock_request.approve),
  `erp_van_sell`/`erp_van_sell_with_payment`/`erp_van_return` (field.sales).
- No-op unless `platform.rpc_authz_enforcement` ON (pilot only). Apex bypass; perms mirror each
  calling action so no legitimate user breaks. Offline reconcile impersonates the originating user.
- **Validation:** `supabase/pilot/validate-rpc-authz.sql` — **70/70 allow/deny assertions
  (7 roles × 10 RPCs)** + flag-OFF no-op proof. **Status: PASS.**

## 4. Section F — server-action enforcement — results

- **Implemented & validated.** Flag-gated `requireActionPerm` added to 12 mutating actions
  (inventory transfers/counts, stock requests, product create/edit/category/drugs, customer
  create/edit/import/journey/status). New `product.edit` permission (migration 0315 + pilot grant
  to admin/manager).
- No-op unless `platform.action_authz_enforcement` ON (pilot only). Reps' direct customer create
  now routes to the governed customer-request (by design).
- **Validation:** `action-authz.test.ts` (allow/deny unit matrix) +
  `supabase/pilot/validate-action-authz.sql` (role×action under live grants); 1406 unit tests +
  build green. **Status: PASS.**

## 5. Remaining open items

| Item | Type | Severity | Status |
| --- | --- | --- | --- |
| SoD splits — warehouse adjust/transfer approve; accountant voucher approve; cancel/write-off | Authorization | **HIGH** | OPEN (audit §F4/F5) |
| Section E — type the 12 DB-only perms + guard invoice-cancel/payment-writeoff | Drift/enforcement | MEDIUM | OPEN |
| Section B — explicit page guards for module+RLS-only read screens | Defense-in-depth | MEDIUM | OPEN |
| Missing grants — `visit.override_gps` owner; admin retail-exec config (MSL/survey/grade) | Grants | MEDIUM | OPEN (decision) |
| Section C — vertical-module page guards | Defense-in-depth | LOW | OPEN (low urgency for FMCG) |
| Cross-vertical permission bleed | Over-grant | LOW | OPEN |
| Promote pilot flags to FMCG default (post-UAT) | Rollout | — | PARKED |

## 6. Risk assessment

- **Tenant isolation:** STRONG — RLS on every key table; no cross-tenant exposure observed.
- **Transactional integrity:** STRONG — money RPCs are atomic, idempotent, server-authoritative,
  and now permission-guarded (D); ~1,000-txn simulation + dry-run previously green.
- **Authorization (in-scope loop):** HARDENED — D + F close the directly-callable RPC and
  hidden-button gaps for the van-sales loop. Validated allow/deny.
- **Residual HIGH:** self-approval SoD in **adjacent** finance/inventory ops (GL vouchers, stock
  adjustments) — outside the core van-sales loop but real. Mitigated short-term by the pilot's small
  set of trusted, single-role users and audit logging; should be split before scale/production.
- **Residual MEDIUM:** read-screen defense-in-depth (B) relies on RLS; DB-only perms (E) need
  typing/guarding; a few owner-decision grants.
- **Operational:** online-first; offline supports check-in/collection/van-load-confirm/survey/forms/
  expense + reconciled offline orders. Returns are online-only.

## 7. Go / No-Go recommendation

**GO — for a controlled, supervised, online-first FMCG pilot on staging**, with these conditions:
1. Keep `platform.rpc_authz_enforcement` and `platform.action_authz_enforcement` ON for the pilot
   (both validated; instantly reversible by flag).
2. Operate with the current small set of single-role users; rely on audit logs while the HIGH SoD
   splits are scheduled.
3. **Before any broad expansion or production rollout (NO-GO until done):** implement the SoD
   splits (§F4/F5), Section E (type + guard the 12 DB-only financial perms), and Section B (page
   guards); resolve the `visit.override_gps` owner and the admin retail-exec config grant.

**NO-GO for production / global rollout** until the HIGH SoD items and Sections B/E are complete.

---

# FMCG Workflow Audit

Per step: **UI · Permissions · Backend enforcement · Mobile · Offline · Reporting · Status.**
Enforcement reflects the pilot (both authz flags ON).

### 1. Open Day
- **UI:** `/today` unified workspace — day-status card (Continue Route / End Day & Settle); the day
  opens on first journey load (work session for today).
- **Permissions:** `field.sales` (page). Day-state gate (`isVanDayOpen`) blocks Sell/Collect/Return
  when no open session (`DayClosedGate`).
- **Backend:** work-session row anchors the day; FMCG-default guard prevents transactions pre-open.
- **Mobile:** My Day is the field home (route-first). **Offline:** day state is online-resolved.
- **Reporting:** the session scopes the day's sales/collections/returns/reconciliation.
- **Status: PASS.**

### 2. Load Request
- **UI:** `/field/van-sales/request` (smart Back) + Requests hub; requested loading date + notes + items.
- **Permissions:** **F-guarded `stock_request.create`** (createStockRequest). Allowed: admin, salesman.
- **Backend:** `erp_stock_requests` + workflow start; warehouse may adjust the date (audited, no
  silent change).
- **Mobile:** Requests tab. **Offline:** online submit.
- **Reporting:** feeds load reports — requested vs approved vs received, fill-rate.
- **Status: PASS.**

### 3. Van Load (approve + confirm)
- **UI:** warehouse approves at `/inventory/requests` (or read-only `/field/van-sales/warehouse`);
  salesman confirms at `/field/van-sales/confirm` (accept/vary per line).
- **Permissions:** approve = **`stock_request.approve`** (route guard **and** D-guard on
  `erp_approve_stock_request`). Allowed: admin, branch_manager, supervisor, warehouse_keeper,
  inventory_controller.
- **Backend:** approval moves stock to the van; only accepted qty posts to van stock (atomic).
- **Mobile:** confirm screen. **Offline:** `van_load_confirmation` create is offline-capable.
- **Reporting:** manifest + service level (requested/approved/received) + variance cases.
- **Status: PASS.**

### 4. Visit
- **UI:** `/field/journey` — Start Visit (auto GPS check-in + customer context); Remaining/Visited
  route tabs; Complete Visit advances.
- **Permissions:** `field.sales`. **Gap:** `visit.override_gps` held by no role → GPS-radius override
  is apex-only (owner decision pending).
- **Backend:** visit check-in + GPS radius (`erp_customer_gps_radius`, default 150m).
- **Mobile:** visit-driven route (flag ON). **Offline:** `visit_checkin` is offline-capable.
- **Reporting:** coverage, journey compliance, GPS compliance.
- **Status: PASS (with GPS-override grant decision open).**

### 5. Sell
- **UI:** `/field/van-sales/sell` (smart Back) — Customer → Products → Review → Issue → Print/Share
  (never auto-prints). Collection-in-Sell payment step (flag ON).
- **Permissions:** `field.sales` (page) + **D-guard `field.sales`** on `erp_van_sell` /
  `erp_van_sell_with_payment`; payment step needs `sales.collect`.
- **Backend:** `erp_van_sell` — atomic, **idempotent**, server-authoritative pricing
  (`erp_resolve_price`), discount-cap + credit + negative-stock guards.
- **Mobile:** mobile-first. **Offline:** offline orders reconciled via short-lived impersonation AS
  the rep → `erp_issue_invoice` (D: `sales.sell`) + `erp_record_payment` (idempotent; D:
  `sales.collect`).
- **Reporting:** invoice → AR, sales/target reports, van accounting.
- **Status: PASS (hardened).**

### 6. Collect
- **UI:** `/field/van-sales/collect` (smart Back) — owed view, settle one receipt across invoices
  (oldest-first or specified).
- **Permissions:** `sales.collect` (collections action) + **D-guard `sales.collect`** on
  `erp_settle_collection`. Allowed: accountant, admin, branch_manager, salesman, supervisor, cash_van…
- **Backend:** `erp_settle_collection` — atomic, **idempotent**, multi-invoice allocation.
- **Mobile:** yes. **Offline:** `collection` create is offline-capable (idempotency-keyed replay).
- **Reporting:** payments → AR reduction, collections, aging.
- **Status: PASS.**

### 7. Return
- **UI:** `/field/van-sales/return` (smart Back) — invoice-anchored; Sold/Previously-Returned/
  Remaining caps (UI + server); mandatory return-reason (seeded; "Other"→note).
- **Permissions:** `field.sales` (page) + **D-guard `field.sales`** on `erp_van_return`.
- **Backend:** `erp_van_return` — atomic, **idempotent**, credit-note linkage, cap ≤ remaining.
- **Mobile:** yes. **Offline:** online-only (not in the offline-sync materializer) — *noted*.
- **Reporting:** credit notes → AR, returns analysis.
- **Status: PASS (returns are online-only).**

### 8. Cash Handover
- **UI:** Requests hub → cash-handover request; confirmer inbox `/field/van-sales/cash-handovers`.
- **Permissions:** `cash.handover.request` (rep) / `cash.handover.confirm` (cashier/supervisor);
  **both RPCs perm-check** (`erp_request_cash_handover`, `erp_decide_cash_handover`). No self-approval.
- **Backend:** governed request → decide → apply, audited.
- **Mobile:** Requests tab + inbox. **Offline:** online.
- **Reporting:** cash-custody trail.
- **Status: PASS.**

### 9. End Day
- **UI:** `/today` "End Day & Settle" → **deep-links `/field/journey?endday=1`** which auto-opens the
  close-day/settlement workflow (the prior dead-end is fixed).
- **Permissions:** `field.sales` / `day.close`.
- **Backend:** settlement precedes close; sequence enforced.
- **Mobile:** no dead-end. **Offline:** online.
- **Reporting:** day settlement totals.
- **Status: PASS (navigation fixed).**

### 10. Close Day
- **UI:** close-day confirmation; after close, Sell/Collect/Return/Issue are blocked (DayClosedGate);
  reopen only via governed request.
- **Permissions:** `day.close` — **`erp_close_day` perm-checks** in-function.
- **Backend:** atomic close; reopen = `erp_request_day_reopen` → `erp_decide_day_reopen` (both
  perm-checked), audited, reopen-count.
- **Mobile:** yes. **Offline:** online.
- **Reporting:** closes the day's books; reopen is auditable.
- **Status: PASS.**

### 11. Reconciliation
- **UI:** `/field/van-reconciliation` (smart Back) — expected vs actual, variance value.
- **Permissions:** `reconciliation.view/manage/approve`. **Good SoD:** compute (`…manage`) by
  supervisor/warehouse_keeper; **approve/settle by branch_manager+** — different roles.
- **Backend:** `erp_compute_van_reconciliation` (perm-checked) + `erp_settle_van_reconciliation`
  (perm-checked).
- **Mobile:** yes. **Offline:** online.
- **Reporting:** variance value → van accounting.
- **Status: PASS (segregation correct).**

### 12. Approvals
- **UI:** `/approvals/queue` + governed inboxes (reopen / cash-handover / customer-request),
  reachable from the van-sales hub discovery tiles.
- **Permissions:** respective approve perms; **every decide RPC perm-checks**; **no self-approval**
  (requester ≠ approver enforced).
- **Backend:** apply-on-approval, audited; master data effective only after approval (no direct
  field-rep writes).
- **Mobile:** approver inboxes. **Offline:** online.
- **Reporting:** approval audit trail.
- **Status: PASS.**

### Workflow audit summary
All 12 steps **PASS** for a controlled pilot. Open within the loop: (a) `visit.override_gps` owner
decision; (b) returns are online-only. SoD is correct **inside** the van-sales loop (reconciliation,
approvals, cash handover); the HIGH SoD risks live in **adjacent** finance/inventory ops (GL
vouchers, stock adjustments) and are scheduled, not blocking a supervised pilot.
