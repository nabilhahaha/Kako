# FMCG Pilot — Defect Log

Live log of findings from real-user pilot execution. Freeze is in effect: code is
written mid-pilot **only** for **Blocker / High / Security**; everything else is
logged **Post-Pilot**. Each entry: Role · Screen · Expected · Actual · Severity ·
Category · Disposition (In-Pilot / Post-Pilot) · Notes.

| ID | Role | Screen | Severity | Category | Disposition | Status |
|---|---|---|---|---|---|---|
| DF-001 | Salesman | My Day / Mobile Navigation | Medium | Usability / Navigation | **Post-Pilot** | Open |

---

## DF-001 — Closed-day state is not action-oriented; operational requests hard to find

- **Role:** Salesman
- **Screen:** My Day (`/today`) / Mobile Navigation
- **Expected:** When the day is closed, the user immediately understands which actions
  remain available and how to continue working.
- **Actual:** The system shows "Your day is closed", but the navigation still lists many
  operational entries (Sell, Collect, Sales Orders, Invoices, Cashbox, …). It is not
  obvious which actions remain available, nor where operational requests (Load Requests /
  Change Requests) live.
- **Severity:** Medium
- **Category:** Usability / Navigation
- **Disposition:** **Post-Pilot** (Medium; not Blocker/High/Security → freeze preserved).

**Triage / verification (read-only):**
- The closed state is rendered by `src/app/(app)/today/salesman-workspace.tsx`
  (`vanSales.dayClosedTitle` / `dayClosedBody` + reopen gate).
- The transactional pages (Sell / Collect / Return) are **gated server-side by the
  day-open gate** — they cannot be executed on a closed day. So the operations are
  correctly **blocked**; the issue is that the **nav does not reflect the closed state**
  (entries are permission/flag-gated, not day-state-gated), leaving the user to discover
  the block only after navigating.
- **Not a permission or security defect** — no closed-day action is actually permitted.
  This is purely presentation/discoverability. Confirms Medium, not High/Security.

**Recommended fix (Post-Pilot, scoped — no new workflow):**
- Make the closed-day card **action-oriented**: show **Allowed** (e.g. Load Request,
  Change/Customer Request, view Statements/Summary, request Reopen) vs **Blocked** (Sell,
  Collect, Return — until reopen), with a single clear **primary next action**.
- Improve discoverability of operational requests (Load Requests / Change Requests) from
  the closed-day state (surface them on the card rather than buried in the menu).
- Optionally **dim/disable** day-state-dependent nav entries when the day is closed (a
  presentation filter; no permission/workflow change).
- Effort: UI/copy + a nav presentation filter on day state. No schema, no new
  permission, no new workflow. Fits the freeze as a post-pilot UX item.

**Backlog:** UX-P1 (closed-day action-oriented experience). See Prioritized Backlog
(end-of-pilot deliverable).
