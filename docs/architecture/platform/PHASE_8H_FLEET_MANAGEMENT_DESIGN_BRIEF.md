# Phase 8H — Fleet Management (industry pack): Pre-Implementation Design Brief

**Status:** Design review first. **No implementation** until approved. Reuse-first · additive ·
multi-tenant RLS · governance + audit · flag default OFF (`KAKO_FLEET_MGMT`). **Optional pack.**

## 1. Intent
Manage the distribution fleet — vehicles, drivers, maintenance, fuel, utilization — building on
the van/route foundation. Relevant where the distributor runs its own delivery vehicles.

## 2. Reuse vs net-new
- **Reuse:** van warehouses + GPS + **route costing** (van-accounting 0229), territories (0215),
  route-intel, the field client (driver = a field role), attachments (documents/photos), GPS.
- **Net-new:** vehicles, drivers (link to users), maintenance schedules, fuel logs, utilization
  rollups, incidents/accidents.

## 3. Data model (additive)
- `erp_vehicles` (`company_id, code, plate, type, capacity, status`), `erp_drivers`
  (`company_id, user_id?, license, status`), `erp_vehicle_maintenance`
  (`vehicle_id, company_id, kind, due_at/done_at, cost, notes`), `erp_fuel_logs`
  (`vehicle_id, company_id, date, litres, cost, odometer`), `erp_vehicle_incidents`. Company-scoped
  RLS; FK-covering indexes.

## 4. Forms / Field-Governance / Mobile / Offline
- Driver checklists (pre-trip inspection, fuel entry) reuse **forms/surveys** (8F) + **offline**
  capture (Step 1). Fuel/odometer entry works offline (queued, server-applied). Governance-aware.

## 5. Audit / Security / Multi-tenant
Maintenance/fuel/incident records audited. Company-scoped RLS. Driver PII (license) treated as
sensitive (redaction in logs; access gated). Documents in the private attachments bucket.

## 6. Integration
Route costing already exists (0229) → fleet cost rolls into route profitability. Telematics/GPS-
tracking integration is a **later optional** connector (Integration Hub) — not in initial scope.
Feeds dashboards/reports (8B/8C). Vehicle cost→accounting deferred (DO-NOT-START boundary).

## 7. Phasing / Risks / Non-goals
- **8H-1** vehicles + drivers registry. **8H-2** maintenance + fuel logs (+ offline fuel entry).
  **8H-3** utilization + incidents + route-cost integration.
- **Risk:** scope into vehicle-asset accounting → out (operational only). **Risk:** live telematics
  expectations → explicitly a later connector, not core. **Risk:** driver PII → sensitive handling.
- **Non-goals:** not live GPS telematics (later connector); not GL/depreciation; not asset mgmt (8I).

**Recommendation:** proceed as an **optional pack** behind `KAKO_FLEET_MGMT` (OFF), reusing the
van/route-costing foundation + forms/offline. Lower priority than the builder family; ship near the
end of Phase 8 as planned. Await approval.
