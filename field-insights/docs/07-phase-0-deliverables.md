# 07 — Phase 0 Deliverables

Phase 0 (Foundation & Isolation) is complete. This document presents the five requested artifacts refreshed for the **enterprise field-execution** model, where the Visit is a hub that generates **Opportunity, Issue, Action, and Follow-up**.

## What was built in Phase 0
- **Standalone app scaffold** in `field-insights/` — React 18 + Vite + TS, own `package.json`/lockfile, builds green (typecheck + production build verified).
- **Installable PWA** — service worker + web manifest generated; offline app shell; OSM map-tile & API runtime caching configured.
- **Offline engine foundation** — Dexie (IndexedDB) store + sync-queue types (`src/lib/db.ts`).
- **Separate Supabase project** — `field-insights` (ref `qulukfxuaklhcztchrbv`), distinct from all VANTORA projects.
- **Separate env** — namespaced `VITE_FI_*` variables; own Supabase client (`fi-auth` storage key).
- **Separate CI/CD** — path-scoped `.github/workflows/field-insights-ci.yml` (runs only on `field-insights/**`); own `vercel.json` for separate deployment.
- **VANTORA untouched** — no edits to repo-root code, `src/`, `supabase/`, or existing workflows.

---

## 1. Architecture Diagram

```
┌──────────────────────── MOBILE PWA (installable, offline-first) ───────────────────────┐
│  React + TS + Vite · Tailwind/shadcn · large touch targets · RTL/i18n                   │
│                                                                                         │
│  ┌── Screens ──────────────┐   ┌── Device ─────────┐   ┌── Offline Engine ───────────┐ │
│  │ Home (Start Visit ≤60s) │   │ Camera  GPS  Mic  │   │ Dexie (IndexedDB)            │ │
│  │ Visit Hub (tabs)        │   │ Map (Leaflet/OSM) │   │ Sync queue (UUID, idempotent)│ │
│  │ Opp/Issue/Action/F-up   │   └─────────┬─────────┘   │ Background flush + retry     │ │
│  │ Dashboards · Reports    │             │             └──────────────┬──────────────┘ │
│  └────────────┬────────────┘             │                            │                │
│       TanStack Query (server cache)  +  Zustand (session)  ───────────┘                │
│                                   │ HTTPS (supabase-js, VITE_FI_*)                       │
└───────────────────────────────────┼─────────────────────────────────────────────────────┘
                                     ▼
        ┌───────────────── SUPABASE  (project: field-insights, ISOLATED) ──────────────┐
        │  Auth (JWT)   Postgres + RLS   Storage (visit-photos, voice-notes)           │
        │  Edge Functions: build-report (PDF), transcribe (voice), scheduled rollups   │
        │  RBAC: 7 roles × region/area scope enforced in Row Level Security            │
        └──────────────────────────────────────────────────────────────────────────────┘

   Deployment: separate Vercel project  ·  CI: field-insights-ci.yml (path-scoped)
   ── No code, schema, DB, env, or pipeline shared with VANTORA ──
```

## 2. Database Schema (execution-graph view)

Full DDL is in `02-database-schema.md`. The defining shape:

```
                    ┌─────────────────────┐
   customers ─< locations                 │
       │                                   │
       └───────< V I S I T >───────────────┘
                 ├─ generates ─> opportunities ─┐
                 ├─ generates ─> issues ────────┤ actions can belong to
                 ├─ generates ─> action_plans <─┘ an opportunity OR issue
                 ├─ generates ─> follow_ups  ──> next_visit (closes loop)
                 ├─ captures  ─> visit_photos, competitor_observations, voice_notes
```
Every visit can generate all four execution entities; cross-link FKs weave them together. Future modules (price checks, audits, route stops, customer-dev) attach to the same hub — see `02-database-schema.md` §9.

## 3. Screen Inventory
Full list in `03-screen-inventory.md` (~50 screens). The execution core: **Home → Start Visit → Visit Hub**, where the Hub's tabs are Overview · Photos · Competitors · **Opportunities · Issues · Actions · Follow-ups** · Voice — each with a one-tap "＋" that pre-fills visit/customer/GPS context.

## 4. User Journey Maps
Full set in `04-user-journey.md`. The headline FMCG-manager/supervisor journey:

```
Home ─tap─> Start Visit ─auto GPS─> pick customer ─> type ─> SAVE  (≤60s, visit exists, syncing)
   └─ then progressively, any time, online or offline:
        ＋Opportunity   ＋Issue   ＋Action   ＋Follow-up   📷Photo   🏷Competitor   🎤Voice
   └─ End visit ─> summary/outcome ─> (optional) Follow-up schedules next visit
```

## 5. Mobile Wireframes
Full wireframes in `05-mobile-ux-mockups.md`. The sub-60-second flow is shown below in §"60-second visit".

---

## The 60-second visit (core UX contract)

> A manager must be able to **create a complete, valid visit in under 60 seconds**, then enrich it progressively. Nothing in the fast path blocks on network.

```
0:00  Home → tap START VISIT                (1 tap)
0:03  Customer: recent list / 1 tap         (GPS auto-captured in background)
0:10  Visit type: chips, 1 tap              (default = last used)
0:15  tap SAVE  → visit created (status: in_progress), already persisted offline
        ───────────── visit is now valid and counted ─────────────
0:15+ Progressive enrichment (optional, any order, resumable later):
        ＋Opportunity  ＋Issue  ＋Action  ＋Follow-up  📷  🏷  🎤
```

**How we guarantee speed**
- One primary action on Home; thumb-zone placement.
- Smart defaults: last customer/type, current GPS, current user as owner.
- Required fields kept to the minimum (customer + type); everything else deferred.
- Optimistic local-first writes (Dexie) — SAVE never waits for the server.
- "Add later" everywhere: a visit can be reopened and enriched until closed.

## Future modules (designed-for, not yet built)
Competitor Intelligence · Price Monitoring · Merchandising Audits · Route Planning · Trade Marketing Audits · Customer Development Tracking — all attach to the Visit hub via the extension design in `02-database-schema.md` §9, reusing the Opportunity/Issue/Action/Follow-up spawn pattern.

## Verification
- `npm run typecheck` → passes.
- `npm run build` → succeeds; emits `sw.js` + `manifest.webmanifest` (PWA).
- Supabase project `field-insights` → `ACTIVE_HEALTHY`, wired via `VITE_FI_*`.
