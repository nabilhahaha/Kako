# Visit Compliance (GPS Distance) — Design & Preparation (Next Phase)

**Status:** DESIGN ONLY — not implemented (backlog). Prepared after the Daily Summary work, per request.
**Goal:** prove the rep was physically at the customer when a visit was recorded — capture the visit GPS, compute the distance to the customer's location, classify compliance, and report it (timeline badge + supervisor compliance %).

---

## 1. Why this is a separate phase

- **Customer GPS already exists** (`erp_customers.latitude / longitude`).
- **Visit GPS is NOT persisted.** The visit/outcome flow never records the rep's device location, so distance cannot be computed from existing data. This needs **new capture + schema** → out of scope for Daily Summary Phase 1 (existing-data-only).

## 2. Data model

### 2.1 Per-visit GPS (extend `erp_visit_outcomes`, or a 1:1 `erp_visit_locations`)
- `visit_lat double precision`, `visit_lng double precision` — the rep's device location at visit time.
- `visit_started_at timestamptz` — when the visit/outcome capture began (system-generated).
- `gps_accuracy_m numeric` — device-reported accuracy (meters).
- `gps_source text` — `device | manual | none`.
- `customer_lat / customer_lng` — **snapshot** of the customer location at visit time (so later customer edits don't rewrite history).
- `distance_m numeric` — computed Haversine distance (null when no customer or no visit GPS).
- `compliance text` — `valid | warning | outside | no_location`.

### 2.2 Company setting
- `compliance_radius_m int default 50` — green threshold; **configurable per company later**.
- `compliance_warning_m int default 100` — yellow upper bound (≈ 2× radius).

All additive + nullable → backward compatible; existing visits read as `no_location`.

## 3. Distance + compliance (pure, testable)

- **Haversine** `distanceMeters(aLat,aLng,bLat,bLng): number` — great-circle distance.
- **Classification** `complianceOf(distance_m, radius=50, warning=100)`:
  - no customer GPS or no visit GPS → **`no_location`** ("لا يوجد موقع")
  - `≤ radius` → 🟢 **valid**
  - `> radius && ≤ warning` → 🟡 **warning**
  - `> warning` → 🔴 **outside**
- **Compliance %** = `valid visits / total visits` (per salesman / day).

## 4. Capture flow

```
Open visit / record outcome
  → navigator.geolocation.getCurrentPosition() (lat, lng, accuracy)
  → send {lat,lng,accuracy,source:'device'} with the outcome/visit
  → server snapshots customer GPS, computes distance (Haversine) + compliance, persists
Permission denied / unavailable → source:'none', compliance:'no_location' (never blocks the visit)
```

System-generated only (no manual editing of GPS by the salesman). Offline → store the local fix + sync later (future).

## 5. Reporting

- **Daily Activity Timeline:** a **المسافة** (distance) column — `12m / 35m / 145m`, or **"لا يوجد موقع"** when absent — plus a colour compliance badge (🟢/🟡/🔴).
- **Daily Summary (salesman):** Average visit distance · Visits within radius · Visits outside radius · Furthest visit distance.
- **Supervisor dashboard (per salesman):** Total visits · Valid visits · Out-of-location visits · **Compliance %** (e.g. "Ahmed 95% · Mohamed 62%").

## 6. Audit

Record per visit: customer GPS · visit GPS · distance · timestamp · user (reuse `erp_log_audit`).

## 7. Rollout, privacy, compatibility

- Flag-gate `platform.visit_compliance` (default OFF).
- Request geolocation permission with a clear purpose; **denial degrades gracefully** (`no_location`), never blocks selling/visits.
- Additive migrations; existing data = `no_location`. Rollback = drop columns + flag.

## 8. Phased plan

| Phase | Deliverable |
| --- | --- |
| A — Schema & settings | visit GPS columns + `distance_m`/`compliance`; company `compliance_radius_m` (default 50) + warning bound. |
| B — Capture | client geolocation on visit/outcome; server Haversine + compliance persist; graceful no-GPS. |
| C — Reports | timeline distance column + compliance badge; Daily Summary distance cards; supervisor Compliance %. |
| D — Audit & config | audit entries; per-company configurable radius (25 / 50 / 100). |

## 9. Testing

- Haversine accuracy vs known coordinate pairs.
- Band classification at boundaries (25/50/100) + `no_location`.
- Compliance % formula; supervisor aggregation.
- Permission-denied path → `no_location`, visit still completes.

---

*Design-only. No schema/capture/UI changes were made. Default radius 50 m, configurable per company in a later phase.*
