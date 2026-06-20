# Territory Intelligence Studio — Usability Audit & Manager Workflow Gap Report

**Scope:** Usability audit of the unified Studio (`/distribution/studio`) from a first-time
manager's perspective. Read-only code audit — **no engine or UI changes made**.
**Branch / PR:** `claude/pilot-ux` · PR #319
**Date:** 2026-06-19
**Focus:** Usability, navigation, onboarding — **not** new engines.

---

## 1. Method

A first-time-manager walkthrough of the Studio against the intended manager workflow,
cross-checked against the source. The intended flow is:

```
Import → Audit → Optimize → Plan → Export
```

The **actual** flow today is:

```
(auto-demo) → Audit → Optimize → Plan → Export
```

Import and day-level planning are the two missing links, plus several smaller
onboarding / navigation gaps documented below.

---

## 2. Gaps Flagged by Review — Both Confirmed

### A1 · Calendar / day planning — CONFIRMED (High)

- `balanceRoutes` emits each assignment as `{ customerId, routeId }` only — it **never
  sets `dayOfWeek`** (`src/lib/tis/optimize-routes.ts:146`).
- The calendar view groups customers by `assignment.dayOfWeek`
  (`src/app/(app)/distribution/planning-board/planning-canvas.tsx:57`). With no day set,
  **every customer falls into the single "Unscheduled" column.**
- Board and Map views populate correctly; only the **Calendar** is effectively empty.
- The `workingDays` input feeds only the route **count** (capacity math in
  `resolveRouteCount`), never day assignment. Generated routes are therefore **not
  distributed across working days**.

**Remediation (small, existing-engine):** after balancing, spread each route's customers
across the working days by cadence / workload and write `dayOfWeek` on each assignment.
Manual drag in the Calendar already works (`reassignDay`); this only fills the initial
distribution. This is a pure addition, not a new engine.

### A2 · Import entry point — CONFIRMED (High)

- The pure adapters exist and the round-trip is validated (`buildTisDatasetFromRows`,
  `csvToRows`, fixed `TIS_CSV_COLUMNS`), **but there is no upload UI anywhere in
  `distribution`** (no `type="file"`, no `FileReader` — verified by search).
- The Studio loads the live tenant or **silently falls back to the Jeddah demo**; a manager
  cannot bring their own Excel / CSV into the workflow.
- Export exists in the toolbar; there is **no symmetric Import.**

**Remediation:** an "Import" stage / toolbar action accepting CSV / XLSX →
`csvToRows` → `buildTisDatasetFromRows` → set the working dataset. The single-model schema
is already defined, so this is wiring, not engine work.

---

## 3. Additional First-Run Findings

### Missing entry points
- No Import (A2).
- Studio **Optimize has no route-count / constraints control** — only Working Days. The
  standalone optimizer exposes Advanced (route count, max/route); the unified flow does not,
  so a manager cannot choose K inside the Studio.

### Empty / confusing screens
- A fresh tenant (fewer than 10 geo-located customers) **silently shows the Jeddah demo with
  no banner** — it looks like real data. No "this is sample data — import yours" cue.
- **Calendar** empty (A1).
- **Size** stage is an intentional placeholder ("needs sizing engine") — acceptable, but it
  is a dead navigation stop with no action.

### Missing actions
- Import / sample-template download (A2).
- Day auto-distribute (A1).
- In the Studio, **Audit is rendered with `labels={{}}`**
  (`src/app/(app)/distribution/studio/studio-workspace.tsx:124`), so route / region /
  salesman groups show **raw IDs instead of names** — the standalone page resolves them from
  the database. Findings read as cryptic codes.
- Scenario **rename / delete** (only Clone A/B/C exists).

### Missing navigation
- Overview's "Next step" always points to **Optimize**, even when the true first step is
  "load your data."
- No **stepper / progress** conveying the Overview → … → Export sequence or completion — the
  sub-nav is free navigation only.
- **Export** is a toolbar icon, not a visible step, though the target flow names it as one.

### Missing onboarding steps
- No first-run guidance on an empty tenant (the demo appears unexplained).
- No **sample CSV template** so a manager knows the expected columns.
- No **Mode A/B/C indicator** explaining what is available given their data completeness.

---

## 4. Severity & Recommended Remediation Order (usability only)

| # | Priority | Gap | Nature |
| :-- | :--- | :--- | :--- |
| 1 | High | Day distribution across working days in Plan (A1) | Small pure addition |
| 2 | High | Import entry point + sample template (A2) | UI wiring over existing adapter |
| 3 | Med | Demo / first-run banner + "import your data" CTA | UI |
| 4 | Med | Resolve Audit labels in the Studio (names, not IDs) | Wiring |
| 5 | Med | Route-count / constraints in Studio Optimize (reuse standalone Advanced) | UI |
| 6 | Low | Make Export a visible step; add a lightweight stepper | UI |
| 7 | Low | Scenario rename / delete | UI |

---

## 5. Note

All items are composition / usability fixes over shipped engines. A1's day-spread is a small
**pure addition** to the optimizer / plan-edit, not a new engine. None of this touches
Apply / RO-4 / VTP-4 — the platform stays read-only + export.

**Recommendation:** address items **1–2** first as a focused *TIS Onboarding & Day-Planning*
usability pass (closing the Import → … → Plan-by-day loop), then **3–5**. The Sales Force
Sizing engine remains queued behind this usability work. Awaiting your priority call.
