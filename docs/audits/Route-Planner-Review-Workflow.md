# Route Planner — Needs Review + Manager Review Workflow

**Surface:** `/distribution/route-planner` (session-only; no live writes) · gated `reports.view`
**Branch / PR:** `claude/pilot-ux` · PR #319 · **Date:** 2026-06-19
**Builds on:** the Route Planner MVP (Upload → Split → Correct → Approve → Excel export).
**Not in this delivery (held per approval):** P4–P5 Journey Planning.

This delivery adds two things on top of the MVP: a **Needs Review** bucket for remote/highway
customers, and a full **manager review workflow** for inspecting territories before moving customers.

---

## 1. Needs Review bucket (remote / highway / outstation)

One far customer should not distort a route. During the split, a customer is set aside as
**Needs Review** (left unassigned) when it sits **both**:

- far in absolute terms — **> 40 km** from its slice centre, **and**
- far relative to its slice — **> 3× the slice's median** distance-to-centre.

Small slices (< 5 customers) are never stripped, and the behaviour is opt-out. Needs Review
customers are:

- **shown on the map** as a distinct amber marker;
- **listed in the side panel** (amber row) — click it to select them all on the map;
- **manually resolvable** — assign to a route, a new route, or keep unassigned;
- **exported on their own “Needs Review” sheet** in the Excel workbook (multi-sheet `.xlsx`).

**Data-integrity fix (found on real data):** the JPFOOD file repeats ~515 customer codes.
Because record ids were synthesised from the code, distinct outlets were silently merging.
Upload ids are now made unique (a `-2`, `-3`… suffix on collision; the code is left intact).

### JPFOOD validation (6,017 real customers)

| Requested K | Generated | Needs Review | Assigned | Workload balance | Two-sheet export |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 40 | 40 | 209 | 5,808 | 93.0% | ✅ |
| 86 | 86 | 150 | 5,867 | 94.4% | ✅ |
| 120 | 120 | 155 | 5,862 | 94.3% | ✅ |

~2.5–3.5% flagged (the genuine highway/outstation tail), exactly-K preserved, `needsReview`
count equals the scenario's unassigned count, and the second sheet is verified.

---

## 2. Manager review workflow

A manager can now **visually inspect territories before deciding to move customers**.

| Capability | Behaviour |
| :--- | :--- |
| **Customer popup** | Click a point → popup with **code · name · route (+ colour swatch) · frequency · lat/lng** and a **“Move to {target}”** button. |
| **Route filtering** | Click a route in the side list → that route stays full-opacity, **all others fade**, the map **zooms to the route extent**, and its stats show in the summary. |
| **Multi-route review** | Click multiple rows to focus **one / several / all** routes (with **All** and **Clear**). Compare Route 1 vs 2, review Route 5 + 6, or a whole area. |
| **Route boundaries** | A **convex-hull outline** is drawn around each route's customers (focused routes, or all via the **Boundaries** toggle) — revealing **shape, overlaps and gaps**. |
| **Route summary panel** | For the focused set (or all): **customers · weekly visits · estimated workload (h) · max radius (km) · compactness · selected count**. |
| **Move workflow** | The move bar shows the **selected count**, the **current route(s)** the selection sits on (“From: …”), and the **target** before you press **Move**. |

Radius and compactness reuse the shared `validatePlanGeography` engine; boundaries use a
convex hull (Andrew's monotone chain). Colours and counts update instantly after a move.

---

## 3. Map selection modes

A **Selection mode** toggle at the top of the map:

- **Box Select** (default) — hold **Shift** and drag a rectangle. Fast rectangular areas.
- **Draw Select** — draw a **freehand polygon**. Good for irregular territories and road/city shapes.

Both modes feed the same flow: selected customers are highlighted, the count is shown, the
selection can be cleared, and **Move to Route** works across one route or several visible
routes — recolouring and recounting instantly.

```
Selection mode:  [ Box Select ] [ Draw Select ]
Selected: 37 customers   From: Route 3, Route 5
Move to:  [ Route 12 ▼ ]   [ Move (37) ]   [ Clear ]
```

---

## 4. Engineering notes

- **No optimizer rebuild** — this is review/visualisation and editing on top of the existing
  single-pass split. New pure, unit-tested helpers: `convexHull`, `routeReview`
  (radius/compactness + hull), `aggregateReview`, plus the Needs Review flagging in
  `simpleGeoSplit` and the multi-sheet `.xlsx` writer.
- **Tests:** full suite **814 passing**, `tsc` clean, i18n ar/en symmetric.
- **Boundaries:** session-only and reversible; nothing is written to live data.

---

## 5. How to test

1. **Distribution → Route Planner**, upload a customer file (or use the template).
2. Enter a route count → **Generate split**. Remote outliers appear amber as **Needs Review**.
3. Click a **route row** to focus it (fades others, zooms, draws its boundary, shows stats);
   click more rows to compare; **All / Clear** to widen or reset.
4. Toggle **Box Select / Draw Select**, select customers, check **From / target / count**,
   press **Move**. Or click a customer → **Move to {target}** in the popup.
5. Resolve **Needs Review** (assign / new route / keep unassigned), **Approve**, **Export** —
   the workbook has a **Route Allocation** sheet and a **Needs Review** sheet.

---

## Next (await approval): P4–P5 Journey Planning

Per-customer frequency (daily · 1–3×/wk · every-10-days · biweekly · monthly), day rules
(weekly day pick; biweekly W1&3 / W2&4; 2–3×/wk auto-spread; capacity; same-day compactness),
and the Journey Plan `.xlsx` export. **Not started** — pending your validation of this workflow.
