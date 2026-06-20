# Territory Intelligence Studio — Manager Walkthrough & Final Usability Gap Report

**Scope:** Complete first-person manager walkthrough of the finished Studio
(`/distribution/studio`), every stage and feature. Read-only code audit — **no
changes made**. Priority: product readiness + manager usability, not new features.
**Branch / PR:** `claude/pilot-ux` · PR #319
**Date:** 2026-06-19

---

## 1. Verdict

The Studio is **functionally complete and coherent** — one workspace, shared
scenario state, Import → Audit → Optimize → Plan-by-day → Export all work, and the
three move scenarios (route / day / salesman) are usable. It is **demo-ready**.

It is **not yet fully product-ready** for daily manager use. Three **workflow
breaks** and a cluster of **discoverability gaps** (no map legend; scope confined to
Plan and reset on navigation; import has no preview/undo) hold it back. None require
new engines — all are presentation / state-management fixes.

---

## 2. Walkthrough (what works · gaps)

### Overview
- **Works:** four KPI cards (coverage · gaps · white-space · balance) + an adaptive
  "Next step" CTA; map shows coverage.
- **Gaps:** KPI cards are **not clickable** (no drill into Audit); the map has **no
  legend**; clicking a map point does nothing.

### Audit
- **Works:** full `TerritoryAuditView` with **resolved names** (region/route/salesman);
  map shows coverage.
- **Gaps:** drill-down links inside the audit **navigate away** to standalone pages
  (e.g. coverage-customers), **leaving the Studio** and the in-session scenario;
  no map legend.

### Map
- **Works:** layer switcher (customers · coverage · ownership · white-space · territory),
  only showing available layers.
- **Gaps:** **no legend** — the colour meaning is invisible even though
  `buildGeoLayers` already returns legend data per layer (it is simply not rendered);
  clicking a point gives **no customer identity / tooltip**; the contextual panel is a
  single line of text (near-empty).

### Optimize
- **Works:** Route count + Working days + Generate; Current-vs-Optimized compare table
  appears after generating; result flows into Plan.
- **Gaps:** no **balance-by** choice (workload vs value) or **max/route** — the engine
  supports both; no route-colour legend on the map; the optimized scenario silently
  **overwrites** any prior "Optimized".

### Plan
- **Works:** full canvas (scope bar + Route/Day/Salesman/Map views), map above, boards
  docked below; live metrics.
- **Gaps (important):** the **persistent map above the board shows ALL customers**
  while the board below is **scoped** — they disagree; scenario **rename/delete**
  missing (only Clone A/B/C).

### Scope Bar
- **Works:** Region → Salesman → Route progressive drill-down; working-set summary;
  Clear; smart region default at scale.
- **Gaps (important):** scope lives **inside the Plan canvas only** — Audit, Map,
  Optimize, Overview, and the persistent map **ignore it**; and because the canvas
  unmounts when you leave Plan, **the scope resets every time** you navigate away and
  back. The intended Region→Salesman→Route→Day→Customer drill-down is therefore not
  yet a *shared* studio state.

### Route / Day / Salesman views
- **Works:** all three render scoped columns with **count · visits/wk · value**
  headers; drag = move route / day / salesman.
- **Gaps:** Day view always shows 7 day columns — **Fri/Sat sit empty** on a 5-day
  week (clutter); `slice(0,120)` still **silently truncates** very full columns
  (VTP-S3 deferred); no "select all routes in region" shortcut.

### Import workflow
- **Works:** Import stage + toolbar action + first-run banner + **sample template**;
  CSV / XLSX / JSON via a server action; tolerant header mapping; success message.
- **Gaps (important):** import **immediately replaces** the dataset with **no
  preview / column-mapping confirmation** and **no "reset to live data" undo** — a
  manager who uploads a wrong/messy file cannot review or revert without a page reload;
  error messages are generic.

### Export workflow
- **Works:** one-click CSV export of the active scenario, single-model schema
  (re-importable).
- **Gaps:** Export is a **toolbar icon only — not a visible step** in the
  Import→…→Export flow; CSV only (no XLSX); no multi-scenario / comparison export.

### Mobile experience
- **Works:** sub-nav scrolls horizontally; panel stacks under the map; metrics wrap.
- **Gaps:** the **60vh map pushes all controls far down** — managers scroll past a big
  map to reach the panel; the scope bar wraps into several tall rows; wide `w-56`
  board columns are awkward on a phone; no **map ⇄ details toggle** for small screens.

---

## 3. Consolidated Gaps by Category

### Workflow breaks (P0)
1. **Scope is Plan-local and resets on navigation** — the canvas unmounts when you
   leave Plan, so the working set is lost on every Overview/Map/Plan hop.
2. **Persistent map vs scoped board disagree** in Plan (map shows all; board shows the
   subset).
3. **Import has no preview/confirm and no undo** — replaces data instantly with no way
   back to live data short of reload.

### Discoverability (P1)
4. **No map legend** anywhere (data exists, unused) — colours are unexplained.
5. **Scope applies only to Plan** — Audit/Map/Optimize/Overview don't honour it.
6. **Export is not a recognizable step**; advanced Optimize options (balance-by,
   max/route) are hidden though supported.

### Navigation (P1)
7. **Deep-links + audit drill-downs leave the Studio same-tab**, losing in-session
   scenario/import (should open in a new tab or stay in-app).
8. No **stepper/progress** for the Import→…→Export sequence; "Size" is a dead stage.

### Missing actions (P1–P2)
9. Map **customer click = no-op** everywhere (no identity/detail/tooltip).
10. **Scenario rename/delete**; **Overview KPIs not clickable** (no drill to Audit).
11. **Reset to live data** after an import.

### Empty states (P2)
12. **Blank map when the data has no coordinates** — no "no locations" message in the
    Studio (the text exists in the geo namespace but isn't shown here).
13. **Empty scoped board** shows nothing rather than a "no customers in this scope" hint.
14. **Size** stage placeholder (intentional, pending the sizing engine).

### UX polish (P2)
15. Day view's empty Fri/Sat columns on 5-day weeks; silent `slice(0,120)` truncation;
    mobile map-first density.

---

## 4. Recommended Remediation (usability only — no new engines)

| Priority | Fix |
| :--- | :--- |
| **P0** | Lift **scope into shared studio state** (persist across stages; drive the persistent map + Audit/Map/Optimize), so map and board agree and the working set survives navigation. |
| **P0** | **Import preview + confirm** (show parsed counts / first rows + detected columns before replacing) and a **"Reset to live data"** action. |
| **P1** | **Map legend** on every map (reuse `buildGeoLayers` legend + route-colour legend); **customer click → name/grade/coverage popup**. |
| **P1** | Make **Export a visible step** (and/or a clearer primary action); surface **balance-by / max-route** as an Optimize "Advanced" disclosure. |
| **P1** | Open **deep-links / drill-downs in a new tab** (or route them in-app) so Studio state isn't lost. |
| **P2** | **Scenario rename/delete**; clickable Overview KPIs; Day view hides non-working days; mobile **map ⇄ details toggle**; empty-state messages (no geo / empty scope). |

A focused **STUDIO-UX hardening pass** (P0 + P1) would take the Studio from
demo-ready to **product-ready** without touching a single engine, and without
starting Sales Force Sizing, RO-4, or VTP-4 (all remain paused).

---

## 5. Screenshots (headless stand-ins)

This environment can't capture a live browser, so static SVG renders of the demo
stand in (committed under `docs/tis-demo/`):

- `jeddah-studio.svg` — Studio Plan layout (sub-nav · metrics · centre map).
- `jeddah-calendar.svg` — **Day view** (visits per working day × route).
- `jeddah-salesman-view.svg` — **Salesman view** (columns = salesmen).
- `jeddah-coverage.svg` — **Map** stage (coverage layer) — and illustrates gap #4
  (no legend).
- `jeddah-routes-6-workload.svg` / `-value.svg` — **Optimize** outputs.

Live preview for manual capture: `/distribution/studio?demo=1`.
