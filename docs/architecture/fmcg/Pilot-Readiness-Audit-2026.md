# Pilot Readiness Audit — FMCG Field Suite (2026-06)

**Type:** audit only — **no new development**. Verifies workflow completeness,
UI reachability, navigation discoverability, role visibility, and pilot blockers
across the 10 delivered areas. Findings are evidence-based (routes, nav table,
server actions/RPCs, permission gates).

**Verdict:** **No Critical blockers.** Core workflows are wired, permission-gated,
branch-scoped (RLS), and audited. The gaps are **discoverability / navigation** and
a few **dangling artifacts** — addressable with small config/nav changes, not new
features. The **Auditor role (H1)** is the most impactful finding.

---

## A. Workflow Validation Matrix

✓ wired & reachable · ⚠ wired but reachability/role gap (see C/E) · n/a not applicable

| Workflow | Happy | Reject | Reopen | Override | Partial Settlement | Carry Forward |
|---|---|---|---|---|---|---|
| **1. Return Approval** | ✓ submit → pending → approve → posted (van + AR + optional CN) | ✓ reject + mandatory reason | n/a | ✓ Override Center force approve/reject (reason + audit) | n/a | n/a |
| **2. End Day Approval & Settlement** | ✓ submit → supervisor → (tracks) → closed | ✓ supervisor reject + reason → returns to salesman | ✓ Override Center reopen closed day (+ legacy reopen flow) | ✓ force-close (reason + audit) | ✓ settle partial → outstanding recorded | ✓ outstanding → next-day custody (card + page) |
| **3. Load Request** | ✓ create → approve (full/partial) → loaded | ✓ reject | n/a | n/a (uses partial approval) | ✓ partial approved qty (`stock_request.adjust`) | n/a |
| **4. Customer Statement Hub** | ✓ search → statement/collect/print/share | n/a | n/a | n/a | n/a | n/a |
| **5. Daily Summary** | ✓ read-only dashboard + drill-down + print | n/a | n/a | n/a | n/a | n/a |
| **6. Cash Custody** | ✓ Today card + page (held/settled/outstanding) | n/a | n/a | n/a | ✓ reflects partial settlement | ✓ carried custody + escalation badge |
| **7. Van Stock Movement** | ✓ per-SKU ledger + print + drill-down | n/a | n/a | n/a | n/a | ✓ van custody persists across days |
| **8. Override Center** | ✓ queue + force actions + history | ✓ force reject | ✓ reopen | ✓ (this IS the override surface) | n/a | n/a |
| **9. Reports** | ✓ return-approval / day-close / override-history loaders | n/a | n/a | n/a | reflected in settlement report | reflected in outstanding aging |
| **10. Permissions & Roles** | ✓ catalog + role map + auditor role | n/a | n/a | override perms opt-in | n/a | n/a |

All "✓" paths were validated end-to-end during build; End Day gating was additionally
verified on staging (non-blocking → closed; blocking → pending_settlement).

---

## B. Missing UI Actions (backend exists, not reachable)

| # | Capability | Status | Severity |
|---|---|---|---|
| B1 | **`day.close.reopen`** permission | **Dangling** — granted to supervisor/branch_manager but NO gate uses it; reopen is gated by `day.reopen` (Override Center). | Low |
| B2 | **`documents.print`** permission | **Not enforced** — print pages are auth+RLS only; nothing checks `documents.print`. | Low |
| B3 | **`day.approve_close_exception`** + `erp_approve_day_close` (legacy coverage-exception close) | Superseded by the chain; legacy field queue still exists but is bypassed when `platform.day_close_approval` is on. | Low |
| B4 | `returns.view_all` for **accountant/auditor** | Permission held, but the **Return Approval Report** UI is only linked from the `returns.approve`-gated queue → not reachable (see C2). | High |

Everything else with a backend action **is** reachable: submit/decide/withdraw
(returns + day close), settle/reconcile, override/force-close/reopen, mark-viewed,
policy edits, load-request approve/adjust.

---

## C. Missing Navigation (pages that exist but aren't discoverable)

Routes with **no nav entry** (verified against `navigation.ts`):

| # | Route | How it's reached today | Gap | Severity |
|---|---|---|---|---|
| C1 | `/field/van-sales/day-close-report` | Link in the Day-Close-Approvals header (needs a `day.close.*` stage perm) | A `reports.view`-only user (auditor/back-office) can't discover it | Medium |
| C2 | `/field/van-sales/approvals/reports` (Return report) | Link in the Return-Approvals header (needs `returns.approve`) | **Unreachable** for accountant/auditor (have `returns.view_all` but not `returns.approve`) | High |
| C3 | `/field/van-sales/override-center/history` | Link in Override Center (needs an override perm) | Auditor (`audit.view`) can't discover it | Medium |
| C4 | `/field/van-sales/statement`, `/summary`, `/cash-custody` | Today **tiles** (salesman workspace only) | Non-salesman roles (supervisor/BM/auditor) have no nav path | Medium |
| C5 | `/field/van-sales/reopen-approvals`, `/cash-handovers` | No nav | Legacy/superseded surfaces — orphaned | Low |
| C6 | `/field/stock/movements` | Today tile (flag) | Supervisors/warehouse who don't see the salesman workspace lack a nav path | Low |

**Root cause:** the new **Reports** (return / day-close / override-history) have **no
top-level nav group** — they hang off action queues. A single "FMCG Reports" or
"Governance" nav group exposing all three (gated by `reports.view`/`audit.view`/
view-all) closes C1–C3.

---

## D. Role Validation (what each role can discover + do)

Based on `ROLE_PERMISSIONS` (post-hardening) and the nav `perm` gates.

| Role | Sees in nav | Can act | Notes |
|---|---|---|---|
| **Salesman** | My Returns, Today tiles (Statement, Summary, Stock, Custody), Load Request (create) | Submit return, submit End Day, withdraw, request load, own custody | ✓ Correct. No approve/settle/override. Credit limit hidden (R2). |
| **Supervisor** | Return Approvals, Day-Close Approvals, Day-Close Settlement, Load Request | Approve/reject returns, all End Day stages, reconcile/settle, adjust load, sees credit + outstanding cash | ✓ Broad operational. No override (opt-in), no policy edit. |
| **Warehouse** | Day-Close Approvals, Day-Close Settlement, Load Request | Reconcile stage + record count, approve/adjust load; **cash hidden** | ✓ R1 fix holds: no cash visibility on board/report. |
| **Cashier** | Day-Close Approvals, Day-Close Settlement | Settle stage, record cash; sees balance + outstanding; **credit hidden** | ✓ R3 fix holds. |
| **Accountant** | Day-Close Approvals, Day-Close Settlement | Settle; sees balance + credit + outstanding; documents export | ⚠ Can't discover the **Return Report** (C2) despite `returns.view_all`. |
| **Branch Manager** | Return Approvals, Day-Close Approvals/Settlement, Load Request | Approve returns + all End Day stages, reconcile/settle, adjust | ✓ No override / policy edit by default (opt-in). |
| **Company Admin** | All (ALL perms) | Everything incl. policy edit, override, reopen | ✓ Apex grantor. |
| **Auditor** | **Nothing** (no nav `perm` matches its read-only set) | Could open day-close-report / override-history / return-report **by URL** only | ⚠⚠ **H1** — the new role has zero discoverable surface. |

---

## E. Pilot Blockers (classified)

### Critical
- **None.** Core flows are wired, gated, RLS-scoped, audited; override/reopen require
  reason + audit; partial settlement + carry-forward validated.

### High
- **H1 — Auditor role has no navigation.** The newly added `auditor` role (and its
  `audit.view`, `returns.view_all`, `reports.view`, `cash.view_outstanding`) maps to
  **no nav item**, so an auditor sees an empty app. *Fix:* add a Governance/Reports
  nav group gated by `reports.view`∨`audit.view`∨`returns.view_all`.
- **H2 — Return Approval Report unreachable for finance/audit (C2/B4).** Linked only
  behind the `returns.approve` queue. *Fix:* surface it in the Reports nav group
  (gated `returns.view_all`∨`returns.approve`∨`reports.view`).

### Medium
- **M1 — Day-Close Report & Override History not discoverable (C1/C3)** for
  `reports.view`/`audit.view`-only users. *Fix:* same Reports nav group.
- **M2 — Statement Hub / Daily Summary / Cash Custody are salesman-tile-only (C4).**
  Supervisors/BMs can't reach them. *Fix:* add nav items (gated `field.sales`∨
  `reports.view`) or render the tiles for supervisor workspaces.
- **M3 — Override perms not granted by default (by design).** Pilot onboarding MUST
  grant `returns.override` / `day.close.override` / `day.reopen` to a named role, else
  the Override Center is invisible. *Action:* document as a pilot setup step (not a code fix).

### Low
- **L1 — Dangling `day.close.reopen`** (B1): retire or repoint to the reopen action.
- **L2 — `documents.print` not enforced** (B2): enforce on print routes or mark reserved.
- **L3 — Legacy orphans** `reopen-approvals` + `cash-handovers` + coverage-exception
  close (C5/B3): decide keep (legacy/Direct mode) vs remove to avoid confusion.
- **L4 — Two reopen mechanisms** (legacy `day.reopen.request/approve` governed flow
  vs Override Center `day.reopen`): clarify which is the pilot path.

---

## F. Recommended pre-pilot actions (no new features — config/nav only)

1. **Add a "Governance / Reports" nav group** exposing Return Report, Day-Close Report,
   and Override History (gated by `reports.view`∨`audit.view`∨view-all). → closes H1, H2, M1.
2. **Add nav items** (or supervisor-workspace tiles) for Statement Hub, Daily Summary,
   Cash Custody. → closes M2.
3. **Pilot setup checklist:** grant override perms to a named approver; assign the
   Auditor role to the compliance user; confirm the demo policy (already seeded). → M3.
4. **Cleanup (optional):** retire `day.close.reopen`, enforce or reserve `documents.print`,
   decide on legacy reopen/handover surfaces. → L1–L4.

These are small, low-risk changes. With #1–#3, the suite is pilot-ready for all eight
roles; #4 is hygiene that can follow the pilot.
