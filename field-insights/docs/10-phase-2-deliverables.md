# 10 — Phase 2 Deliverables

Phase 2 delivers the field-capture loop, the offline-first sync engine, framework-driven DVAP capture, and three lightweight extensible foundations. Builds green (typecheck + PWA build).

## 1. Offline-first sync engine (`src/lib/db.ts`, `src/lib/sync.ts`)
- **Dexie (IndexedDB)** local store: `visits` cache + a generic **outbox** queue.
- `enqueue(table, op, payload)` writes the mutation locally; every record uses a **client-generated UUID** so flushes are **idempotent** (insert = upsert on `id`).
- `flushQueue()` pushes pending mutations to Supabase; on error it records the message and retries later. Auto-flush on mount, on `online`, and every 30s.
- `useSyncEngine()` exposes the pending count; the shell shows a sync badge.

## 2. The 60-second visit (`StartVisitPage`)
- Select customer, capture GPS (geolocation hook), choose visit type, optional objective → **Save** writes locally and navigates to the visit hub instantly (no network needed).

## 3. Visit hub + quick capture (`VisitDetailPage`)
- One-tap capture of **Opportunity, Issue, Action, Follow-up** — all offline-first via the outbox, anchored to the visit (and customer).
- **End visit** records summary/outcome; the server trigger recomputes Visit Quality + Customer Health on completion.

## 4. Framework-driven DVAP capture
- Loads the active default **DVAP assessment framework** (dimensions, weights, bands) from the config metamodel — no hardcoded dimensions.
- Captures 0–100 per dimension; computes overall + band **client-side** (mirrors `fi_recompute_assessment`) for instant, offline results; saves `assessments` + `assessment_scores` via the queue.

## 5. Lightweight foundations (migration `0012`, additive)
- **SKU Intelligence:** `skus` catalog (code, name, brand, category, pack size, barcode) + `competitor_price_points.sku_id` link. Extensible toward availability/price analytics.
- **Route Performance:** `routes` + `route_stops` (planned vs visited) + `v_route_performance` view (completion %). A completed stop links to its `visit_id`.
- **Generic Attachments:** polymorphic `attachments` (entity_type/entity_id + storage path/kind/mime/size). Attach files to any entity.
- All three have RLS and are intentionally minimal and extensible.

## 6. Deployment
Field Insights deploys as its **own** Vercel project (see `DEPLOYMENT.md`) — Root Directory `field-insights`, separate from VANTORA's `kako`/`kako-fieldsync`.

## Notes / next increments
- Child entities created offline sync to the server and appear in lists after flush; full offline mirroring of every entity type is an incremental enhancement.
- Photo/voice blob upload to Storage, the visits map, dashboards, and reports are later phases.
