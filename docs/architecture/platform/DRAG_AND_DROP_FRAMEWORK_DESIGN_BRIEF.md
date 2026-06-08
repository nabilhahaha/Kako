# Platform-Wide Drag-and-Drop Framework: Pre-Implementation Design Brief

**Status:** Design review first (promotes the backlog item — Phase 7 is complete, so this is now
greenlit for design). **No implementation** until approved. Reuse-first · additive · multi-tenant ·
governance + audit · flag default OFF (`KAKO_DND_FRAMEWORK`). **Prerequisite for 8B (Dashboard
Builder).**

## 1. Intent
One reusable DnD **platform capability** (single engine + primitives) so every drag surface shares
the same behavior, accessibility, RTL, persistence, permission, and audit model — not N bespoke
implementations. (Supersedes `PLATFORM_DRAG_AND_DROP_FRAMEWORK_BACKLOG.md`.)

## 2. Architecture
A thin platform wrapper over a mature, **RTL + touch + keyboard-capable** DnD library, exposing:
- a **pure reorder/move model** (`reorder(list, from, to)`, `move(item, fromContainer,
  toContainer, index)`) — pure + unit-tested, framework-agnostic;
- a **persistence contract** (optimistic update → server-confirm → conflict-safe rollback, reusing
  the Step 1/Step 2 optimistic + retry patterns);
- a **permission contract** (drag/drop gated by a supplied permission check);
- an **audit contract** (every reorder/move emits an audit event via `erp_log_audit`).
Consumers supply data + handlers only.

## 3. Reuse vs net-new
- **Reuse:** the existing workflow-builder canvas (React Flow) is the first refactor target — the
  Production Readiness Review (M9) flagged it for keyboard/RTL/mobile hardening; this framework
  standardizes that. Optimistic-persistence + audit patterns reused.
- **Net-new:** the shared wrapper + pure model + the contracts; a11y (keyboard nav + ARIA) and RTL
  as first-class.

## 4. Data model
None of its own — persistence is delegated to each consumer's existing tables (e.g. journey
sequence, canvas layout, dashboard layout). The framework defines the *contract*, not storage.

## 5. Mobile / Offline / Audit / Security / Multi-tenant
- **Mobile/touch/RTL/a11y:** hard requirements (keyboard nav + ARIA + touch + RTL), per the backlog.
- **Audit:** every reorder/move audited by the consumer via the contract.
- **Permission-aware:** drag/drop actions gated by role/permission (the consumer's check).
- **Multi-tenant:** no tenant data of its own; consumers' persistence is RLS-scoped.
- **Offline:** optimistic + server-confirmed; conflict-safe (reuses the platform's optimistic
  patterns).

## 6. Target consumers (incremental adoption)
Route planning/sequencing · territory assignment · **Dashboard Builder (8B)** · form builder ·
workflow canvas (refactor) · field-governance ordering · org hierarchy · role templates ·
entity-360 layouts · nav/menu builder. Adopt one-at-a-time behind the flag.

## 7. Phasing / Risks / Non-goals
- **DnD-1** pure model + wrapper + contracts (engine-first, unit-tested; a11y/RTL/touch).
  **DnD-2** refactor the workflow canvas onto it (proves the contract). **DnD-3** expose for 8B.
- **Risk:** library lock-in → keep the pure model framework-agnostic so the lib is swappable.
  **Risk:** a11y/RTL regressions → automated + manual a11y checks in CI/Playwright.
- **Non-goals:** not a specific feature (it's infrastructure); does not own persistence.

**Recommendation:** proceed engine-first (pure model + contracts), behind `KAKO_DND_FRAMEWORK`
(OFF), refactoring the workflow canvas as the proving consumer before 8B builds on it. Await approval.
