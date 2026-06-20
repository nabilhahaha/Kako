# Admin Center Alignment — AC-2 Completion Review

### Entity pages on ModulePage (Hybrid: shell-only, managers unchanged)

**Branch:** `claude/pilot-ux` · **PR:** #319 · **Date:** 2026-06-18

AC-2 standardizes the four platform **entity** pages onto the shared `ModulePage` shell, per the approved **Hybrid** decision (shell now; managers reused 100% verbatim; **no** deep 3-panel `AdminWorkbench` recomposition). One page per commit, validated after each. Presentational only — no business-logic, permission, RLS, workflow, or route change.

---

## 1. What shipped (one commit per page)

| Page | Route | Manager (reused verbatim) | Gate (unchanged) |
|------|-------|---------------------------|------------------|
| Plans | `/platform/plans` | `PlansManager` (tabs/accordion) | platform-owner |
| Roles | `/platform/roles` | `RolesManager` | platform-owner |
| Staff | `/platform/staff` | `StaffManager` | `manage_users` |
| Entitlements | `/platform/entitlements` | company picker | flag + owner/super-admin |

Each commit: tsc clean · suite **1596 passed** · build green.

---

## 2. Before → After (all four)

```
BEFORE                                   AFTER
<div className="space-y-6">              <ModulePage title subtitle>
  <PageHeader title desc />                 …Manager (unchanged: its own
  <Manager … />                                tabs / list / detail / actions)…
</div>                                   </ModulePage>
```

- Consistent header / subtitle / spacing via `ModulePage`.
- Each manager keeps its internal structure exactly as-is (no list/detail recomposition).
- Not-authorized guards also wrapped in `ModulePage`.
- Title now uses the standard `text-xl font-semibold` shell (the intended consistency change). No functional change.

**Capture points (preview, latest):** `…/platform/plans · /roles · /staff · /entitlements` (authenticated screenshots can't be captured from the sandbox).

---

## 3. Validation

| Check | Result |
|-------|--------|
| tsc | ✅ clean (each page) |
| Suite | ✅ 1596 passed / 192 skipped |
| Build | ✅ all routes compile |
| Routes | ✅ unchanged (no redirects) |
| Gates | ✅ unchanged — platform-owner / manage_users / entitlement guards preserved; platform-governance invariants still pass |

---

## 4. Admin Center coverage so far

| Surface | Container | Phase |
|---------|-----------|-------|
| Companies | AdminWorkbench (Company360) | pre-existing |
| Overview · Analytics · Activity · Copilot · Audit · Drugs | ModulePage | AC-1 ✅ |
| Plans · Roles · Staff · Entitlements | ModulePage (managers unchanged) | AC-2 ✅ |
| **Billing** | bespoke (pending) | **AC-4** |

10 of 11 platform surfaces are now on a shared container; **Billing** is the only one left.

---

## 5. Plan adjustment & next step

- **AC-3 (EntityListPanel unification) — now MOOT under Hybrid.** It existed to unify the *workbench* list model when recomposing managers into `EntityListPanel`. Since managers stay unchanged, there is no `EntityListPanel` adoption on the platform layer to unify. **Recommendation: skip/park AC-3** (revisit only if a future "Deep Workbench" initiative is approved).
- **AC-4 (Billing) — last shell-only pass.** Wrap `/platform/billing` (`BillingAdmin` tables) in `ModulePage`, optionally with a `TopGroupingNav` (Subscriptions · Invoices). Low risk, same pattern as AC-1/AC-2; reuse-only.

**After AC-4 Billing, every platform surface is standardized**, completing Admin Center Alignment.

---

## 6. Awaiting your call

Confirm **skip AC-3** (moot under Hybrid) and **proceed with AC-4 Billing** (shell-only) — then Admin Center Alignment is complete and the next workstream is **P5 Customer Workbench** (preceded by the pre-P5 Permission Override Demonstration recorded in the roadmap backlog). CRM Evolution remains deferred.
