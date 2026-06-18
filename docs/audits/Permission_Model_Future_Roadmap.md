# Permission Model — Future Roadmap (deferred)

**Status:** Roadmap only — **not approved for implementation.** Recorded per the Permission Model Verification review (2026-06-18). The current bounded User Access Override (UAO) model is approved **as-is**; the items below are explicitly deferred and require their own separate design + approval before any work.

> Guardrails reaffirmed: **do not** expand the delegable allowlist, **do not** implement per-user menu visibility, **do not** implement per-user action policies — until separately approved.

---

## R-PM-1 — Delegable allowlist expansion (deferred)

- **Today:** per-user overrides are bounded to `DELEGABLE_OPERATIONAL_PERMISSIONS` =
  `customer.request · stock_request.create · cash.handover.request · day.reopen.request · returns.create · sales.discount`, with an immutable deny-list (platform.*/security.*/rls.*/treasury.*/accounting.post/integrations.manage/settings.users/super.admin).
- **Gap:** privileged permissions like `returns.approve` and `customers.view_balance` cannot be granted per-user.
- **If pursued:** a governance review of which additional permissions are safe to delegate, then extend the allowlist. Each addition is a security decision (some are intentionally privileged). Resolution/UI already support any allowlisted permission, so this is a *policy* change, not an engine change.
- **Risk:** medium-high (security surface) — requires explicit sign-off per permission.

## R-PM-2 — Per-user menu visibility overrides (deferred)

- **Today:** nav visibility is derived only from permission + module + flag + rank; `nav-profiles.ts` provides role-wide curated views (relevance, not access). **No per-user menu override exists.**
- **If pursued (new capability):** a new table (e.g. `erp_user_nav_overrides`: user_id, href/section, show|hide), a resolver layer in `navigation.ts`/sidebar, and an admin UI. Must remain *cosmetic* (hiding a permitted item ≠ revoking the permission) or be explicitly tied to permission to avoid a false sense of security.
- **Risk:** medium — clarify "hide ≠ deny" semantics up front.

## R-PM-3 — Per-user action overrides (deferred)

- **Today:** `erp_action_policies` is **per-company** (risk/reason/approval/reversal), not per-user. Per-user differentiation happens only via UAO permission overrides (within the allowlist).
- **If pursued:** extend `erp_action_policies` (or a new table) with an optional user scope + resolver precedence (user policy over company policy) + UI. Interacts with the approval-workflow engine — needs careful design.
- **Risk:** medium-high — overlaps workflow/approval logic.

---

## Disposition

All three are **parked**. The approved baseline is the bounded UAO model exactly as audited. Revisit only on an explicit, separate approval — likely after the Admin Center Alignment and P5 workstreams, and not part of the current consistency-first program.
