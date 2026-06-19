# Geo Intelligence Base Map — Completion Review

**Workstream:** TIS stage — Geo Intelligence (Base Map)
**Branch / PR:** `claude/pilot-ux` · PR #319
**Status:** Complete (GEO-1 data layer + GEO-2 MapLibre surface, all 5 layers) · validated · pushed
**Date:** 2026-06-19

---

## 1. Objective (met)

Put the TIS-0 dataset + Territory Audit on a map with toggleable layers, Simple Mode, Mode
A/B/C aware, reusable by Route Optimization / Visual Planning / Sales Force Sizing.

**All five target capabilities delivered:** Customer map · Coverage layer · Ownership layer ·
White-space layer · Territory imbalance layer.

---

## 2. Phases

| Phase | Commit | Scope | Tests |
| :--- | :--- | :--- | :--- |
| **GEO-1** Data layer | `ed2ef9e` | Pure `buildGeoLayers` (provider-agnostic features + colours + legends) | 6 |
| **GEO-2** Surface | `29df2bc` | MapLibre renderer + `/distribution/geo` page + i18n + nav (all 5 layers, switcher, legend, popup) | — |

GEO-3 (layers + legends + drill-downs) was folded into GEO-2 — all five layers shipped together.

---

## 3. Map-Technology Decision

**MapLibre GL JS** (your call): open-source, no vendor lock, no mandatory Mapbox/Google billing,
heatmap/clustering-ready for later phases. The **GEO-1 data layer stays provider-agnostic**, so
the renderer can be swapped without touching the data. Base tiles: OpenStreetMap raster (no API
key), overridable with `NEXT_PUBLIC_MAP_STYLE_URL` (a vector style, e.g. OpenFreeMap/MapTiler)
for production.

---

## 4. What Shipped

**Data (`tis/geo.ts`, pure):** `buildGeoLayers(dataset, audit)` → five `GeoLayer`s, each a set of
`{ lat, lng, name, category, color, value? }` features + a legend. Capability-aware; geo-less
customers excluded; renderer-agnostic + exportable.

**Surface (`/distribution/geo`, MapLibre, Simple Mode):**
- Coloured circle layer fed by the active `GeoLayer` (data-driven `circle-color`).
- One-tap **layer switcher** (shows only available layers) + **legend** (resolved salesman/region
  names, i18n coverage/white-space labels).
- **Customer popup** → opens Customer 360.
- Fits bounds to the data; MapLibre loaded **client-only via dynamic import** (separate chunk —
  route bundle stays ~3 kB).

---

## 5. Layer Reference

| Layer | Colour by | Mode |
| :--- | :--- | :--- |
| Customers | grade (a/b/c, neutral ungraded) | A+ |
| Coverage | coverage status (green/amber/blue/red) | B/C |
| Ownership | salesman (hashed palette) | A+ |
| White-space | un-worked (red) vs worked (grey) | A+ |
| Territory imbalance | region (hashed); legend carries each region | A+ |

---

## 6. Simple Mode

Opens on the customer map with a plain layer switcher — no GIS jargon, no styling controls. Tap
a pin → name → open customer. Layers that lack data are hidden (e.g. coverage in Mode A); empty
geo → "no locations" hint.

## 7. Role Behavior (RLS-scoped)

| Role | Map scope |
| :--- | :--- |
| Salesman | own customers |
| Supervisor | team customers (coverage/ownership of the team) |
| Manager | branch/region customers (territory imbalance + white-space) |

## 8. Forward Compatibility

- **Route Optimization / Visual Planning:** consume the same `GeoLayer` features + scenario
  overrides (TIS-0-3); MapLibre supports the future drag-and-drop + scenario layers natively.
- **Sales Force Sizing:** reads the same per-territory rollups.
- **Heatmaps / clustering** (sales/white-space heat): MapLibre built-ins — a later phase, no
  data-layer rework.

## 9. Validation

`tsc` clean · **1725 tests** (+6 geo) · `next build` compiled (`/distribution/geo` built;
MapLibre in a dynamic chunk).

> Screenshots: not capturable in this headless environment. The build confirms the route
> renders; the map UI is described above (switcher · coloured pins · legend · popup).

## 10. Deferred (later phases / forks)

- **Heatmaps · clustering** (sales/white-space density) — MapLibre built-ins, next Geo phase.
- **Drag-and-drop territory planning · scenario layers** — Visual Territory Planning workstream.
- **Territory polygons/boundaries** — needs boundary geometry (currently region is shown by
  point colour, not filled areas).
- Production vector tile/style via `NEXT_PUBLIC_MAP_STYLE_URL` (ops config).

## 11. Next

Per the priority order, **Route Optimization Studio** (#6) is next — it builds on TIS-0
scenarios + the Geo layers (map planning) and the FR workload/balance, with its own
Simple/Advanced split. To be opened with an audit-first design package.
