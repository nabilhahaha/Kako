# Territory Intelligence Studio — Completion Review (STUDIO-1 → STUDIO-3)

**Workstream:** Territory Intelligence Studio (TIS) UX Consolidation
**Branch / PR:** `claude/pilot-ux` · PR #319
**Commits:** STUDIO-1 `c47c595` · STUDIO-2 `5cbed33` · STUDIO-3 `d807830`
**Date:** 2026-06-19
**Status:** Complete — shipped, validated, deployed (Vercel `kako` Ready)

---

## 1. Objective

Fold the five TIS capabilities — Territory Audit, Geo Intelligence, Route Optimization,
Visual Territory Planning, and (reserved) Sales Force Sizing — into **one map-centric
manager workspace** with sub-navigation, **without changing any underlying engine**.

The objective was no longer additional engines; it was a **unified manager experience**:

- One persistent map at the centre.
- One shared scenario state across Audit, Geo, Optimize, and Plan.
- One workflow: **Overview → Audit → Map → Optimize → Plan → Size**.
- Route boards, scenarios, audit findings, and metrics all bound to the same
  dataset + scenario state.
- Preserve all existing engines and standalone routes.
- Read-only + export only — **Apply (RO-4 / VTP-4) stays paused**.

---

## 2. What Shipped

### STUDIO-1 — Shell, shared state, embedded stages (`c47c595`)

- New workspace at **`/distribution/studio`** with a left sub-nav walking the
  manager through Overview → Audit → Map → Optimize → Plan → Size.
- **One shared dataset + scenario state** (`scenarios[]` + `activeId`) threaded
  through every stage. A plan generated in **Optimize** (`balanceRoutes`) becomes
  the scenario the **Plan** board edits and the **Map** colours — one object, no rebuild.
- **Persistent centre map** (single MapLibre instance, `key="studio-map"`):
  scenario-route colour in Optimize/Plan, geo layer (coverage / ownership /
  white-space / territory) elsewhere.
- **Composition only — zero engine changes.** Each stage renders an existing
  surface: `TerritoryAuditView`, `buildGeoLayers`, the Optimize current-vs-optimized
  compare, and the extracted controlled `PlanningCanvas`.
- Extracted `PlanningCanvas` + `MetricsBar` so the standalone Planning Board and the
  Studio share **one** canvas / scenario implementation.
- Demo-aware server page (`?demo=1` or empty live tenant → Jeddah 500), ungated
  under `reports.view`. `studio` i18n namespace (ar/en symmetric) + nav item + label.

### STUDIO-2 — Map-centric layout + shared scenario flow (`5cbed33`)

- The map is now the **anchor**: non-Plan stages render the persistent map at the
  centre with a **contextual side panel** (`xl:w-[380px]` on wide screens, stacked
  below on narrow screens).
- The **Plan** stage gives the map full width and **docks the route boards beneath
  it** — exactly the layout the UX package called for.
- Shared scenario flow **Optimize → Plan → Map** verified over a single object:
  `balanceRoutes` writes the `optimized` scenario, the stage switches to Plan, and
  the same `PlanningCanvas` + map recolour from the same `applyScenario` result.

### STUDIO-3 — Guided Overview, discoverability, mobile (`d807830`)

- **Overview** leads with an adaptive **"Next step"** card — gaps → start with
  Audit; uneven balance → generate an optimized plan; else → fine-tune in Plan —
  above the one-click Optimize CTA, so a manager always knows the next move.
- **Discoverability + back-compat:** every embedded stage carries an
  **"Open full tool ↗"** deep-link to its standalone route
  (`/territory-audit`, `/geo`, `/route-optimizer`, `/planning-board`).
- **Mobile:** sub-nav scrolls horizontally; the contextual panel stacks under the
  map on narrow screens.
- `studio` i18n extended (ar/en symmetric): `nextStep` / `nextAudit` /
  `nextOptimize` / `nextPlan` / `openFull`.

---

## 3. Stage Behaviour (Simple Mode)

| Stage | Map centre | Contextual panel |
| :--- | :--- | :--- |
| **Overview** | Coverage layer | Headline KPIs (coverage % · gaps · white-space · balance) + adaptive "Next step" + Optimize CTA |
| **Audit** | Coverage / white-space | Territory Audit findings (gaps · imbalance · distribution) with drill-downs |
| **Map** | Layer switcher (customers · coverage · ownership · white-space · territory) | Layer lead text |
| **Optimize** | Generated route colour | Working days + Generate + Current-vs-Optimized compare table |
| **Plan** | Scenario route colour (full width) | Route boards / calendar dock below for drag-and-drop; live metrics header |
| **Size** | Coverage | "Needs the sizing engine" placeholder (reserved for priority #9) |

Export (single model) is available throughout; **Apply stays paused**.

---

## 4. Validation

| Gate | Result |
| :--- | :--- |
| `tsc --noEmit` | Clean (all three phases) |
| TIS vitest | 58 / 58 passing |
| i18n symmetry | 8 / 8 passing (ar/en symmetric) |
| `next build` | Green — `/distribution/studio` ≈ 9.3 kB |
| Vercel `kako` | Deployed **Ready** |

A static studio-layout SVG (`docs/tis-demo/jeddah-studio.svg`) is committed as a
headless screenshot stand-in: sub-nav · shared metrics strip · centre map coloured
by the 6-route Plan scenario on the Jeddah demo.

**Preview:** `/distribution/studio?demo=1`

---

## 5. Boundaries Respected

- **No engine touched:** `auditTerritory`, `buildGeoLayers`, `balanceRoutes`,
  `scenarioMetrics`, `plan-edit`, `datasetToCsv` consumed as-is.
- **Standalone routes preserved** and surfaced as deep-links.
- **Read-only + export only** — RO-4 / VTP-4 / Apply remain paused pending the
  write-architecture approval.
- **Simple Mode** kept throughout; Mode A/B/C graceful degradation intact via
  `resolveCapabilities`.
- **Demo isolation** — the Jeddah 500 demo is the validation environment; no
  production or pilot tenant data touched.

---

## 6. Next Workstream

The reserved **Size** stage awaits the **Sales Force Sizing** engine (priority #9),
which will fill it as a pure engine + thin surface, consistent with the rest of the
TIS family. Awaiting direction to begin its design package.
