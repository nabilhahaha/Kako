# Permission & Role Audit — FMCG Field Suite (2026-06)

**Scope:** the recently delivered features (Return Approval, End Day Approval &
Settlement, Cash Custody, Customer Statement Hub, Daily Summary, Van Stock
Movement, Load Request, Inventory Reconciliation, Financial Settlement, Reports).
**Type:** audit only — no new workflows built. Findings + recommendations.

**Apex tiers (bypass all gates by design):** Platform Owner (`isPlatformOwner`) and
global Super Admin (`isSuperAdmin`) hold everything. Company roles `admin` and
`manager` map to `ALL` permissions. These are *not* repeated in every cell below.

**Roles audited:** PO = Platform Owner · CA = Company Admin (`admin`) · BM = Branch
Manager · SUP = Supervisor · SAL = Salesman (+ Driver) · WH = Warehouse Keeper ·
CASH = Cashier · ACC = Accountant · AUD = Auditor (closest existing role =
`viewer`: `reports.view`, `accounting.view`, `inventory.view`).

Legend: ✓ granted · — not granted · RLS = allowed but row-scoped by RLS · ⚠ = finding
(see Risk Review).

---

## A. Permission Matrix (Role × Permission × Feature)

### 1. Return Approval Workflow
| Action | Permission | PO | CA | BM | SUP | SAL | WH | CASH | ACC | AUD |
|---|---|--|--|--|--|--|--|--|--|--|
| Create / request return | `returns.create` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — |
| Approve | `returns.approve` | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — |
| Reject (reason req.) | `returns.reject` | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — |
| Override policy | `returns.override` | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| View all / reports | `returns.view_all` | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | — ⚠ |
| My Returns (own) | `returns.create` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — |
| Change approval policy | Company-Admin (role) | ✓ | ✓ | — ⚠ | — | — | — | — | — | — |
| Print / Share return PDF | `field.sales`∨`reports.view` (api/pdf) | ✓ | ✓ | RLS | RLS | RLS | — | — | RLS | RLS |

### 2. End Day Approval & Settlement
| Action | Permission | PO | CA | BM | SUP | SAL | WH | CASH | ACC | AUD |
|---|---|--|--|--|--|--|--|--|--|--|
| Submit End Day | `day.close.submit` | ✓ | ✓ | — | — | ✓ | — | — | — | — |
| Withdraw (no stage acted) | `day.close.submit` (own) | ✓ | ✓ | — | — | ✓ | — | — | — | — |
| Supervisor review | `day.close.supervisor` | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — |
| Reopen settled close | `day.close.reopen` | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — |
| Override day close | `day.close.override` | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| Legacy reopen (coverage) | `day.reopen.request` / `.approve` | ✓ | ✓ | ✓(appr) | ✓(appr) | ✓(req) | — | — | — | — |
| Change settlement policy | Company-Admin (role) | ✓ | ✓ | — ⚠ | — | — | — | — | — | — |

### 3. Inventory Reconciliation (End Day track)
| Action | Permission | PO | CA | BM | SUP | SAL | WH | CASH | ACC | AUD |
|---|---|--|--|--|--|--|--|--|--|--|
| Record count / approve | `day.close.reconcile` | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | — |
| View reconciliation | `reconciliation.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — |
| Manage reconciliation | `reconciliation.manage` | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | — |

### 4. Financial Settlement (End Day track)
| Action | Permission | PO | CA | BM | SUP | SAL | WH | CASH | ACC | AUD |
|---|---|--|--|--|--|--|--|--|--|--|
| Record settlement (full/partial) | `day.close.settle` | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | ✓ | — |
| Confirm cash handover (legacy) | `cash.handover.confirm` | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | ✓ | — |

### 5. Cash Custody
| Action | Permission | PO | CA | BM | SUP | SAL | WH | CASH | ACC | AUD |
|---|---|--|--|--|--|--|--|--|--|--|
| My custody (own, Today card + page) | `field.sales`∨`sales.collect` | ✓ | ✓ | RLS | RLS | ✓ | — | RLS | RLS | — |
| Settlement & custody board (all reps) | `day.close.settle`∨`day.close.reconcile` | ✓ | ✓ | ✓ | ✓ | — | ✓⚠ | ✓ | ✓ | — |
| **View Outstanding Cash** (board/report) | same | ✓ | ✓ | ✓ | ✓ | — | ✓⚠ | ✓ | ✓ | RLS |

### 6. Customer Statement Hub
| Action | Permission | PO | CA | BM | SUP | SAL | WH | CASH | ACC | AUD |
|---|---|--|--|--|--|--|--|--|--|--|
| View hub / search | `field.sales` | ✓ | ✓ | RLS | RLS | ✓ | — | — | — | — |
| **View customer balance** | `field.sales` (no dedicated gate) ⚠ | ✓ | ✓ | RLS | RLS | ✓ | — | — | — | — |
| **View credit limit** | `customers.manage`∨`reports.view` ⚠ | ✓ | ✓ | ✓ | ✓ | ✓⚠ | — | ✓(CASH has customers.manage) | ✓ | ✓ |
| Start collection | `sales.collect` | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | — |
| Open statement / print | print page (auth + RLS) | ✓ | ✓ | RLS | RLS | RLS | — | RLS | RLS | RLS |
| Share statement PDF | `field.sales`∨`reports.view` (api/pdf) | ✓ | ✓ | RLS | RLS | ✓ | — | — | RLS | RLS |

### 7. Daily Summary
| Action | Permission | PO | CA | BM | SUP | SAL | WH | CASH | ACC | AUD |
|---|---|--|--|--|--|--|--|--|--|--|
| View own summary | `field.sales` | ✓ | ✓ | RLS | RLS | ✓ | — | — | — | — |
| Supervisor view / rankings | `field.sales` (+ team scope) | ✓ | ✓ | RLS | RLS | own | — | — | — | — |
| Print | print page (auth + RLS) | ✓ | ✓ | RLS | RLS | RLS | — | — | — | — |

### 8. Van Stock Movement
| Action | Permission | PO | CA | BM | SUP | SAL | WH | CASH | ACC | AUD |
|---|---|--|--|--|--|--|--|--|--|--|
| View own van | `field.sales`∨`inventory.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | ✓ |
| View any rep | `reports.view`∨`inventory.view` | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | ✓ |
| Print | print page (auth + RLS) | ✓ | ✓ | RLS | RLS | RLS | RLS | — | — | RLS |

### 9. Load Request Workflow
| Action | Permission | PO | CA | BM | SUP | SAL | WH | CASH | ACC | AUD |
|---|---|--|--|--|--|--|--|--|--|--|
| Create request | `field.sales` | ✓ | ✓ | — | — | ✓ | — | — | — | — |
| View warehouse availability | `stock.view`∨`inventory.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | ✓ |
| Approve / partial-approve | `stock_request.approve` | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | — |
| **Edit approved quantities** | `stock.adjust` ⚠ | ✓ | ✓ | ✓ | — ⚠ | — | ✓ | — | — | — |

### 10. Reports
| Action | Permission | PO | CA | BM | SUP | SAL | WH | CASH | ACC | AUD |
|---|---|--|--|--|--|--|--|--|--|--|
| Return approval report | `returns.view_all`∨`returns.approve`∨`reports.view` | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | ✓(reports.view) |
| End Day report | `reports.view`∨ any `day.close.*` stage | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| Sales / aggregate reports | `reports.view` | ✓ | ✓ | ✓ | ✓ | — | — | — | ✓ | ✓ |

---

## B. Risk Review

### B1. Excessive / cross-domain permissions
- **R1 (Medium) — Warehouse sees cash on the Settlement board.** The Settlement &
  Custody board and End Day report load both tracks for anyone holding *either*
  `day.close.settle` **or** `day.close.reconcile`. A Warehouse Keeper (reconcile
  only) therefore sees **Outstanding Cash by salesman**. Cash visibility should be
  limited to settlement/finance roles.
- **R2 (Medium) — Salesman sees Credit Limit.** Credit-limit visibility in the
  Statement Hub is gated by `customers.manage` ∨ `reports.view`. The Salesman holds
  `customers.manage`, so reps see every customer's credit limit. Many distributors
  hide this from reps.
- **R3 (Low) — Cashier sees Credit Limit.** Same gate; `cashier` holds
  `customers.manage` → credit limit visible. Likely unintended for a POS cashier.
- **R4 (Low) — Customer Balance has no dedicated gate.** Shown to all `field.sales`
  holders (and across the hub). Acceptable for field sales, but not configurable.

### B2. Missing permissions / capabilities
- **R5 — Policy changes bypass the permission system.** "Change Approval Policy"
  and "Change Settlement Policy" are guarded by a **role check** (`role === 'admin'`
  ∨ platform owner), not a grantable permission. `it_admin` (holds `settings.users`)
  **cannot** edit these, and a Branch Manager can never be delegated policy edits
  without becoming full admin. No `settings.workflow_policy` permission exists.
- **R6 — Financial document export/print has no dedicated permission.** Share PDF
  (invoice / collection / return / **statement**) is gated by `field.sales` ∨
  `reports.view` at `/api/pdf/*`; print pages are auth-only (RLS-scoped). There is
  no `documents.share` / `documents.print` capability, so companies that must
  restrict financial-document export cannot.
- **R7 — No `auditor` role.** The audit asks for an Auditor; the closest is
  `viewer` (read-only: reports/accounting/inventory). A read-only Auditor that can
  see approvals, settlements and audit trails (but never act) does not exist.

### B3. Separation-of-duties (SoD)
- **End Day: enforced.** No self-approval (submitter ≠ approver), and the policy
  `separation_of_duties` flag blocks a prior-stage actor from acting again
  (`canActOnStage` + `erp_day_close_stage_events`, mirrored in the RPC). ✓
- **Return Approval: partial.** No self-approval is enforced; there is no
  multi-stage SoD (single approval stage), which is acceptable.
- **R8 (Low) — Edit-Approved-Quantities is on a different axis than Approve.** Load
  Request "edit approved qty" uses `stock.adjust`; "approve" uses
  `stock_request.approve`. A **Supervisor can approve but cannot edit** (no
  `stock.adjust`), while **Warehouse/Branch Manager can edit**. The two should be
  the same authority (or an explicit, intentional split).

### B4. Privilege-escalation / approval-bypass
- **No bypass found in the chain logic.** Apex tiers bypass role/SoD by design but
  **never** self-approval; track RPCs (`erp_settle_day_cash`,
  `erp_reconcile_day_stock`, `erp_decide_day_close_stage`) re-check branch access,
  no-self, and SoD server-side via `erp_guard_rpc` + explicit guards.
- **R9 (Low) — `returns.override` and `day.close.override` have no UI/RPC surface.**
  The permissions exist and are role-mapped, but no action consumes them yet
  (override is designed, not wired). Dangling permissions invite confusion; either
  wire them (with audit) or mark them reserved.
- **R10 (Info) — Override is correctly narrow.** `day.close.override` = Branch
  Manager + admin only; `returns.override` excludes Supervisor. Good.

---

## C. UI Coverage Audit (permission → UI behaviour)

| Surface | Behaviour when lacking permission | Verified |
|---|---|---|
| Feature pages (all 10) | **Hidden** — `redirect('/dashboard')` on the gate | ✓ |
| Nav items | **Hidden** — nav `perm` gating (returnApprovals, dayCloseApprovals, dayCloseSettlement, returnPolicy, dayClosePolicy) | ✓ |
| Return approver queue | Approve/Reject shown only with `returns.approve`; queue page redirects otherwise | ✓ |
| End Day queue | Stage actions shown only for **actable** stages (`actableStages` from held perms); non-actable rows show "not your stage" | ✓ |
| Settlement board | Record-settlement / record-count buttons gated by `canSettle` / `canReconcile` | ✓ |
| Statement Hub credit limit | **Hidden** column unless `canViewCreditLimit` | ✓ |
| Statement Hub collect | Start-Collection routes; collect gated downstream by `sales.collect` | ✓ (downstream) |
| Load Request approver | `canApprove` / `canRequest` flags drive the adjuster UI | ✓ |
| Cash Custody card | Rendered only when `platform.day_close_approval` on; warning/escalation badges by data | ✓ |
| Settings policy consoles | Page redirects unless admin/platform-owner; **Read-only** state for non-admins = not reachable | ✓ |
| **Gaps** | `returns.override` / `day.close.override` — **no UI** (R9). Edit-approved-qty visible to `stock.adjust` not `stock_request.approve` (R8). Outstanding-cash columns not hidden from reconcile-only users (R1). | ⚠ |

UI states present: **Hidden** (page redirect / nav gate), **Approver Action**
(flag-driven buttons), **Read-only/Hidden field** (credit limit). Missing:
explicit **Disabled** (vs hidden) affordances and a **read-only Auditor** view.

---

## D. Recommendation Report

### D1. New permissions to add
1. `settings.workflow_policy` — grant Approval/Settlement/Day-Close policy editing
   without full `admin` (fixes R5; lets `it_admin`/delegated admins configure).
2. `customers.view_credit` — gate Credit-Limit visibility (fixes R2/R3); default
   off for `salesman`/`cashier`. Pair with a `platform.credit_limit_visibility`
   capability per the platform principle.
3. `customers.view_balance` — gate Customer-Balance visibility (R4); default on for
   field roles, off-able per company.
4. `documents.share` (+ optionally `documents.print`) — gate financial-document
   PDF export/share (R6); default on for `field.sales`, restrictable.
5. `cash.view_outstanding` — gate Outstanding-Cash visibility so Warehouse
   (reconcile-only) doesn't see cash (R1); held by settle/finance roles.
6. Add an **`auditor`** role (read-only): `reports.view`, `accounting.view`,
   `returns.view_all`, `reconciliation.view`, `cash.view_outstanding`, plus a new
   `audit.view` for the audit log (R7).

### D2. Permissions to split
- **Load Request edit vs approve (R8):** introduce `stock_request.adjust` (edit
  approved quantities) distinct from `stock_request.approve`, and grant both to the
  approving roles so Supervisor can edit what they approve. Today edit rides on
  `stock.adjust` (a warehouse op-level permission) — wrong axis.
- **Cash vs inventory visibility on the board (R1):** split the board's data by the
  caller's track permission (settle → cash columns; reconcile → stock columns).

### D3. Permissions to merge / retire
- Consider retiring or clearly reserving `returns.override` and `day.close.override`
  until their actions exist (R9), OR wire minimal override actions with mandatory
  reason + audit.
- `day.close` (legacy direct close) and `day.close.submit` overlap conceptually; keep
  both (direct vs chain) but document that `day.close.submit` is the chain entry and
  `day.close` the Direct-mode close — avoid granting both meaning to one role
  ambiguously (salesman holds both today, which is fine).

### D4. High-risk permissions requiring audit logging
All already audited via `erp_log_audit` / `logAudit`; **verify coverage** for the
items below and add where missing:

| Permission / action | Audited today | Action |
|---|---|---|
| Approve / Reject Return (`returns.approve/reject`) | ✓ `van_return.approve/reject` | keep |
| Reopen Day (`day.reopen.*`, `day.close.reopen`) | partial — legacy reopen audited; `day.close.reopen` RPC **not yet built** | add audit when built |
| Override Day Close (`day.close.override`) | ✗ (no action yet) | **must** audit on build |
| Change Approval / Settlement Policy | ✓ `return_policy.update` / `day_close_policy.update` | keep |
| Edit Approved Quantities (Load Request) | RPC `erp_approve_stock_request` before/after audit; confirm `adjustStockRequest` path audits | verify |
| Settle cash / Reconcile stock | ✓ `day_close.settle` / `day_close.reconcile` + stage events | keep |
| Share / Print financial PDF | ✗ (no event) | add a lightweight `document.export` audit event |

### D5. Special-focus verdicts
| Item | Current authority | Verdict |
|---|---|---|
| **Reopen Day** | `day.reopen.request`(rep)→`day.reopen.approve`(SUP/BM); `day.close.reopen` reserved | OK; build `day.close.reopen` action with audit |
| **Override Day Close** | `day.close.override` (BM/admin) | OK scope; action not built — audit on build |
| **Approve / Reject Return** | `returns.approve` / `returns.reject` (SUP/BM/area+) | OK, audited |
| **Change Approval Policy** | role==admin / PO | tighten via `settings.workflow_policy` (R5) |
| **Change Settlement Policy** | role==admin / PO | same |
| **Edit Approved Quantities** | `stock.adjust` ⚠ | **split** → `stock_request.adjust` (R8/D2) |
| **View Outstanding Cash** | settle∨reconcile ⚠ | **scope** to settle/finance (R1/D2) |
| **View Credit Limit** | `customers.manage`∨`reports.view` ⚠ | **gate** via `customers.view_credit` (R2) |
| **View Customer Balance** | `field.sales` | add `customers.view_balance` (R4) |
| **Share PDF** | `field.sales`∨`reports.view` | add `documents.share` (R6) |
| **Print Financial Documents** | auth + RLS only | add `documents.print` + export audit (R6/D4) |

---

## E. Summary

- **Core approval security is sound:** no self-approval, branch-scoped RLS,
  SECURITY-DEFINER RPC guards, SoD for End Day, narrow override roles, policy edits
  restricted to admin/PO.
- **Top fixes (by impact):** R1 (warehouse sees cash) → split board visibility; R2/R3
  (reps/cashier see credit limit) → `customers.view_credit`; R5 (policy edits need a
  grantable permission) → `settings.workflow_policy`; R8 (edit-approved-qty on the
  wrong permission) → `stock_request.adjust`; R6 (financial PDF export ungoverned) →
  `documents.share`/`.print` + audit.
- **Structural gap:** no read-only **Auditor** role and no `audit.view` — recommended
  before scaling to more modules.
- All recommended permissions/capabilities should follow the platform principle:
  **Platform Capability → Company Policy → Role Permission**, so each is grantable,
  configurable, and defaulted safely.
