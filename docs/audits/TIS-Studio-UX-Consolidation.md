# Territory Intelligence Studio — UX Consolidation Package

**Goal:** Fold the five TIS capabilities into **one map-centric workspace** with sub-navigation,
**without changing any underlying engine**. Composition + layout only.
**Status:** Design / UX package (no engine changes). Phased build to follow on approval.
**Date:** 2026-06-19

---

## 1. Target Experience

One workspace, one shared dataset + scenario state, a **persistent map at the centre**, and a
left sub-nav that walks the manager through:

```
Overview → Audit → Map → Optimize → Plan → Size
```

Each step reuses an **already-built surface**; the map stays in view as the spatial anchor, with
findings, route boards, scenarios, and metrics arranged around it.

---

## 2. Current State (audit)

Today these are **five separate routes**, each standalone:

| Stage | Existing surface | Engine |
| :--- | :--- | :--- |
| Audit | `/distribution/territory-audit` (`TerritoryAuditView`) | `auditTerritory` (TA-1) |
| Map | `/distribution/geo` (`GeoMap`, MapLibre) | `buildGeoLayers` (GEO-1) |
| Optimize | `/distribution/route-optimizer` (`RouteOptimizer`) | `balanceRoutes` (RO-1) |
| Plan | `/distribution/planning-board` (`PlanningBoard` board·map·calendar) | scenario engine + `plan-edit` (VTP) |
| Size | — (Sales Force Sizing engine not built; priority #9) | — |

**Gaps:** (a) no single workspace — managers hop between tools; (b) **scenario state is not shared**
across Optimize ↔ Plan ↔ Map (each rebuilds it); (c) the map is one tab, not the centre of gravity.

---

## 3. Architecture (composition only — no engine change)

A new shell `/distribution/studio` that **embeds the existing components** and threads one state:

```
StudioWorkspace (client context)
  · dataset:   TisDataset (loaded once via loadTisDataset / demo)
  · scenarios: Scenario[] (Current · Optimized · A · B · C)  ← shared across stages
  · active:    scenarioId · stage
  · derived:   liveMetrics(active) · auditTerritory · buildGeoLayers (memoised)

Layout (map-centric)
  ┌───────────┬───────────────────────────────┬───────────────────────┐
  │ Sub-nav   │            MAP (centre)         │  Contextual panel      │
  │ Overview  │   persistent MapLibre canvas    │  (per stage):          │
  │ Audit     │   coloured by the active stage  │   Overview→KPIs        │
  │ Map       │   layer / scenario route        │   Audit→findings       │
  │ Optimize  │                                  │   Optimize→compare     │
  │ Plan      │                                  │   Plan→route boards    │
  │ Size      │                                  │   Size→sizing (future) │
  └───────────┴───────────────────────────────┴───────────────────────┘
                         Plan stage → route boards / calendar dock below the map
```

- **Map is always mounted** (one MapLibre instance); the active stage swaps the **layer** it
  colours by (coverage/ownership/white-space in Audit·Map; scenario route in Optimize·Plan).
- **Shared scenario state:** a plan built in **Optimize** (`balanceRoutes`) becomes a scenario the
  **Plan** board edits and the **Map** colours — one object, no rebuild.
- **Reuse, not rewrite:** each stage renders the **existing component**
  (`TerritoryAuditView`, `GeoMap`/its layer builder, `RouteOptimizer` controls, `PlanningBoard`),
  fed from the shared context. The standalone routes remain as deep-links/back-compat.
- **No engine touched:** `auditTerritory`, `buildGeoLayers`, `balanceRoutes`, `scenarioMetrics`,
  `plan-edit`, `datasetToCsv` are all consumed as-is.

---

## 4. Stage Behaviour (Simple Mode)

| Stage | What the manager sees (map centre + panel) |
| :--- | :--- |
| **Overview** | Headline KPIs (coverage % · gaps · white-space · balance) + a "what to do" summary; map shows coverage. One-click "Optimize" to jump ahead. |
| **Audit** | Map coloured by coverage/white-space; panel = Territory Audit findings (gaps · imbalance · distribution) with drill-downs. |
| **Map** | Geo layer switcher (customers · coverage · ownership · white-space · territory). |
| **Optimize** | Controls (working days, Advanced weights); map coloured by generated route; panel = Current-vs-Optimized compare. |
| **Plan** | Map coloured by scenario route; route boards / calendar dock below for drag-and-drop; live metrics header; scenario tabs. |
| **Size** | Reserved slot for Sales Force Sizing (engine = next workstream); shows "needs the sizing engine" until built. |

Flow reads as **Overview → Audit → Map → Optimize → Plan → Size**, but every stage is reachable
from the sub-nav. Export (single model) available throughout; **Apply (VTP-4) stays paused**.

---

## 5. Phased Plan (composition; no engine change)

| Phase | Scope |
| :--- | :--- |
| **STUDIO-1** | Shell + `StudioWorkspace` context (shared dataset + scenarios) + left sub-nav + embed the 4 existing surfaces as stages (standalone routes kept) |
| **STUDIO-2** | Map-centric layout — one persistent map at centre, stages swap its layer; share scenario state Optimize ↔ Plan ↔ Map |
| **STUDIO-3** | Overview stage (KPIs + guided next-step) + "Size" placeholder; polish, mobile, deep-links |

Each phase: `tsc` + `vitest` + `next build`; completion review. Sales Force Sizing engine is its
own (#9) workstream that later fills the reserved "Size" stage.

---

## 6. Simple Mode & Compatibility

- One workspace, plain sub-nav, map always visible; no jargon. The guided order is the default,
  free navigation is allowed.
- **Mode A/B/C** intact (the shell uses `resolveCapabilities` to enable/grey stages by data).
- **Standalone vs VANTORA** unchanged — the Studio runs on uploaded (demo/Mode A) or live data;
  Export everywhere, Apply only in VANTORA (paused fork).

---

## 7. Recommendation

Build **STUDIO-1 → STUDIO-2 → STUDIO-3** as pure composition over the shipped engines/surfaces.
This delivers the unified, map-centric Territory Intelligence Studio without touching a single
engine, and reserves the "Size" stage for the Sales Force Sizing workstream. Awaiting approval to
proceed (or to fold this into the active autonomous track).
