# Permission Model — Future Roadmap & Backlog (deferred)

**Status:** Roadmap / documentation only — **not approved for implementation.** Recorded per the Permission Model Verification review and the follow-up backlog request (2026-06-18). The current bounded User Access Override (UAO) model is approved **as-is**. The items below are explicitly deferred and each requires its own separate design + approval before any work.

> Guardrails reaffirmed: **do not** expand the delegable allowlist, **do not** implement per-user menu visibility, **do not** implement per-user action policies — until separately approved. No permission-model changes at this stage.

---

## Backlog item 1 — User-Specific Menu Visibility (deferred)

- **Goal:** ability to show/hide specific navigation items for **individual users**, separate from role permissions.
- **Today:** nav visibility derives only from permission + module + flag + rank; `nav-profiles.ts` gives role-wide curated views (relevance, not access). **No per-user menu override exists.**
- **If pursued (new capability):** new table (e.g. `erp_user_nav_overrides`: user_id, href/section, show|hide), a resolver layer in `navigation.ts`/sidebar, and an admin UI. Must clarify **"hide ≠ deny"** semantics (cosmetic hiding is not a security boundary).
- **Risk:** medium.

## Backlog item 2 — User-Specific Action Policies (deferred)

- **Goal:** per-**user** action governance — user-level approval, restriction, escalation, and exception rules.
- **Today:** `erp_action_policies` is **per-company** only (risk/reason/approval/reversal). Per-user differentiation happens only via UAO permission overrides (within the allowlist).
- **If pursued:** extend `erp_action_policies` (or a new table) with an optional user scope + resolver precedence (user over company) + UI; interacts with the approval-workflow engine — careful design required.
- **Risk:** medium-high (overlaps workflow/approval logic).

## Backlog item 3 — Delegable Permission Allowlist Review (deferred)

- **Goal:** future governance review for expanding the current UAO delegable allowlist.
- **Today:** `DELEGABLE_OPERATIONAL_PERMISSIONS` = `customer.request · stock_request.create · cash.handover.request · day.reopen.request · returns.create · sales.discount`; immutable deny-list bounds it (platform.*/security.*/rls.*/treasury.*/accounting.post/integrations.manage/settings.users/super.admin).
- **Candidates to evaluate:** `returns.approve`, `customers.view_balance`, and other operational permissions.
- **Required:** explicit **security review before any expansion** (some candidates are intentionally privileged). The engine + UI already support any allowlisted permission, so this is a *policy/governance* change, not an engine change.
- **Risk:** medium-high (security surface).

## Backlog item 4 — Permission Override Demonstration (deliverable BEFORE P5)

- **Goal:** before the **P5 Customer Workbench** workstream begins, provide a practical demonstration of:
  1. Role permissions
  2. User Access Overrides (within the bounded allowlist)
  3. Effective permission resolution order
  4. The actual UI navigation path (where each is configured/observed)
- **Form:** a walkthrough/demo package (screens + capture points + a worked example using a delegable permission such as `returns.create`), not new functionality.
- **Status:** **scheduled as a gate before P5** — to be produced when Admin Center Alignment completes and before P5 starts. Documentation/demonstration only; no code.

---

## Disposition

All four are **parked**. The approved baseline is the bounded UAO model exactly as audited. Items 1–3 are revisited only on explicit, separate approval (likely after Admin Center Alignment and P5). Item 4 is a **pre-P5 demonstration deliverable** (documentation only). None are part of the current consistency-first program.
