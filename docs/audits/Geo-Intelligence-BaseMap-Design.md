# Geo Intelligence Base Map — Design & Implementation Plan

**Workstream:** TIS stage — Geo Intelligence (Base Map), on TIS-0 + Territory Audit
**Status:** Design + autonomous phased execution (escalate at the map-tech fork)
**Date:** 2026-06-19

---

## 1. Objective

Put the TIS-0 dataset and Territory Audit on a **map**: a customer base map with toggleable
layers (Coverage · Ownership · White-space · Territory imbalance), in Simple Mode, supporting
Mode A/B/C, and reusable by Route Optimization Studio, Visual Territory Planning, and Sales
Force Sizing.

**Target first capabilities:** Customer map · Coverage layer · Ownership layer · White-space
layer · Territory imbalance layer.

---

## 2. Current State (audit)

- **Inputs exist:** `erp_customers.latitude/longitude` (already in TIS-0 `geo`), the TIS-0
  dataset, and the Territory Audit outputs (coverage gaps · per-group balance · white-space).
- **Gap:** there is **no map surface and no map-feature read-model**. The data is map-ready;
  the rendering layer and the dataset→features transform do not exist.
- **No map library** is currently a dependency — the renderer choice is the one architecture
  fork (see §6).

---

## 3. Reuse Analysis

| Need | Asset | Reuse |
| :--- | :--- | :--- |
| Customer geo | TIS-0 `geo` (`erp_customers.lat/lng`) | 100% |
| Dataset / capabilities | TIS-0 + `resolveCapabilities` | 100% |
| Coverage status colors | Coverage Engine status set | 100% (map to hex) |
| Audit layers (balance · white-space) | Territory Audit (TA-1) outputs | 100% |
| Ownership / territory | TIS-0 `ownership` | 100% |

**≈85% reuse.** Net-new: a **provider-agnostic geo-feature read-model** (pure) + a **map
renderer** (the one new dependency) + the page.

---

## 4. Recommended Architecture — provider-agnostic

Split the renderer from the data so the map-tech choice is **not locked in** (consistent with
the no-vendor-lock TIS principle):

```
GEO-1  geo.ts (pure)   TisDataset + TerritoryAudit → GeoLayer[]  (points · category · color · weight + legend)
GEO-2  <MapCanvas>      renders GeoLayer[] on a base map (chosen tech) — swappable
GEO-3  layer toggles + legends + drill (customer popup → Customer 360 / coverage list)
```

- **`GeoLayer`** = a `FeatureCollection`-shaped set of `{ id, lat, lng, name, category, color,
  value? }` + a `legend`. Pure, testable, **exportable** (the same features feed a future
  static export / print and any renderer).
- **Layers (GEO-1):** customers (by grade) · coverage (by status) · ownership (by salesman,
  hashed palette) · white-space (worked vs un-worked) · imbalance (by territory + balance legend).
- **Capability-aware:** coverage layer only in Mode B/C; others degrade per `resolveCapabilities`.
- **Forward compatible:** Route Optimization & Visual Planning consume the same `GeoLayer`
  features + scenario overrides; Sales Force Sizing reads the same per-territory rollups.

---

## 5. Phased Implementation

| Phase | Scope | Dependency |
| :--- | :--- | :--- |
| **GEO-1** | Pure geo-feature read-model (`tis/geo.ts`): dataset+audit → `GeoLayer[]` + palette + legends + tests | **None** (proceeds now) |
| **GEO-2** | Map renderer (`<MapCanvas>`) + base **Customer Map** page + layer toggle (Simple Mode) | **Map-tech choice (§6)** |
| **GEO-3** | Coverage · Ownership · White-space · Imbalance layers wired + legends + customer popup drill-downs | GEO-2 |

GEO-1 is provider-agnostic and ships first. GEO-2 needs the map-tech decision.

---

## 6. Map-Technology Decision (ESCALATION)

The renderer is the one major fork. Options for this Next.js / multi-tenant / MENA / standalone
context:

| Option | Key/cost | Pros | Cons |
| :--- | :--- | :--- | :--- |
| **Leaflet + OpenStreetMap** (recommended) | **None** | Simplest, free OSM tiles, tiny, huge ecosystem, no vendor lock — fits Simple Mode + standalone | Raster tiles; heatmaps via plugin |
| **MapLibre GL JS** | None (needs a tile/style source) | Vector, built-in heatmaps/clustering, powerful | Needs a tile/style provider; heavier |
| **Mapbox GL JS** | **API key + billing** | Polished, vector | Cost, vendor lock, key management |
| **Google Maps** | **API key + billing** | Familiar, geocoding | Cost, vendor lock |

**Recommendation:** **Leaflet + OSM** for the base map — zero key/cost, lowest friction, fits
standalone Mode A, and the provider-agnostic `GeoLayer` lets us swap to MapLibre later for
heatmaps with no data-layer rework.

---

## 7. Simple Mode (mandatory)

- Opens on the **customer map** with one obvious layer switcher (Coverage · Ownership ·
  White-space · Territory); no GIS jargon, no styling controls.
- Tap a pin → name + key facts → open Customer 360 / coverage list.
- Empty/absent data → "needs X" (e.g., coverage layer hidden in Mode A).

---

## 8. Validation & Completion

`tsc` + `vitest` for GEO-1 (pure); `next build` once the renderer/page exist (GEO-2+).
Completion review per phase. Escalate again only for further map-tech/architecture forks.
