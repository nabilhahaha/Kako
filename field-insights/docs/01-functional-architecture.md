# 01 — Functional Architecture

## 1. Purpose & Scope

FIELD INSIGHTS is a mobile-first field force application. A field user walks into a store/customer, opens the app (online or offline), creates a **Visit**, and during that visit captures **Photos**, **Competitor observations**, **Opportunities**, **Issues**, **Action plans**, and **Voice notes**, all anchored to **GPS + timestamp**. Managers consume the resulting data through **Dashboards** and **Reports**.

## 2. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                       CLIENT (PWA, mobile-first)                   │
│                                                                    │
│  React + TS + Vite + Tailwind/shadcn                               │
│  ┌───────────────┐  ┌───────────────┐  ┌────────────────────────┐ │
│  │  UI / Screens │  │ Device layer  │  │  Offline engine        │ │
│  │  (modules)    │  │ Camera / GPS  │  │  Dexie (IndexedDB)      │ │
│  │               │  │ Mic / Map     │  │  + Sync queue + worker  │ │
│  └──────┬────────┘  └──────┬────────┘  └───────────┬────────────┘ │
│         │                  │                       │              │
│         └────── TanStack Query (cache) + Zustand (session) ──────┘ │
│                              │ (online)                            │
└──────────────────────────────┼────────────────────────────────────┘
                                │ HTTPS (supabase-js)
                ┌───────────────▼─────────────────────────────┐
                │      SUPABASE  (NEW dedicated project)        │
                │                                              │
                │  Auth (JWT)   Postgres + RLS   Storage        │
                │  Edge Functions: PDF/report build, transcribe │
                │                  hooks, scheduled rollups     │
                └──────────────────────────────────────────────┘
```

## 3. Tech Stack & Rationale

| Layer | Choice | Why |
|---|---|---|
| App shell | React 18 + Vite + TS | Fast, typed, proven; matches team familiarity without sharing VANTORA code |
| Installability/offline | **PWA** (vite-plugin-pwa, Workbox) | "Add to home screen", offline app shell, background sync |
| UI kit | Tailwind + shadcn/ui (Radix) | Accessible, large-touch-target components, fast to build |
| Server cache | TanStack Query | Caching, retries, optimistic updates, online/offline awareness |
| Local DB | **Dexie (IndexedDB)** | Durable offline store for visits/photos/queue larger than localStorage |
| Session/UI state | Zustand | Lightweight; auth/session, draft visit, network status |
| Backend | **Supabase (new project)** | Postgres + Auth + Storage + RLS + Edge Functions in one, fully separate from VANTORA |
| Maps | react-leaflet + OSM | No API key needed; clusters visits |
| Charts | Recharts | Dashboards |
| PDF | jsPDF + autotable | Client-side report export, works offline |
| Forms/validation | react-hook-form + zod | Fast data entry, schema validation shared client/edge |
| i18n | i18next | Multi-language field teams (EN/AR-ready, RTL) |

> All dependencies are installed into `field-insights/node_modules` from `field-insights/package.json`. Nothing is imported from the VANTORA tree.

## 4. Offline-First Model (core design principle)

Field users work in stores with poor connectivity, so **offline is the default path**, not a fallback.

**Write path (create visit, photo, note, etc.)**
1. Every mutation writes to **Dexie** first and renders immediately (optimistic UI).
2. The record gets a client-generated UUID (`id`) + `sync_status = 'pending'` + `updated_at`.
3. Binary blobs (photos, audio) are stored in IndexedDB and uploaded to Supabase Storage when online.
4. A **sync queue** (FIFO, idempotent by UUID) flushes when connectivity returns (`navigator.onLine` + Background Sync API where supported).

**Read path**
- TanStack Query reads from Supabase when online and hydrates Dexie; when offline it serves the last cached data from Dexie.

**Conflict resolution**
- Records carry `updated_at`. Server uses **last-write-wins per row** with an `audit_logs` trail; list-type children (photos, actions) are append-only so they rarely conflict.

**Sync states surfaced in UI:** `Draft → Pending sync → Synced → Failed (retry)`, shown as a small badge on each visit/photo.

## 5. Device Capabilities

| Capability | Web API (PWA) | Native (optional Capacitor phase) |
|---|---|---|
| Camera | `<input capture>` + `getUserMedia` | `@capacitor/camera` |
| GPS | `navigator.geolocation` | `@capacitor/geolocation` (background) |
| Voice | `MediaRecorder` | `@capacitor/voice-recorder` |
| Storage | IndexedDB | Filesystem + IndexedDB |
| Push | Web Push | `@capacitor/push-notifications` |

GPS is captured **at visit start** and **on each photo** (lat, lng, accuracy, timestamp). A configurable **geofence check** compares captured coordinates to the selected location to flag "out of range" visits (GPS validation).

## 6. Reporting & Analytics

- **Client-side PDF** (jsPDF) for individual Visit/Opportunity/Competitor/Customer-history reports — works offline.
- **Edge Function** (`build-report`) for heavier, multi-record **Market Intelligence Report** (server-rendered PDF, emailed/stored in Storage).
- **Materialized rollups** (scheduled Edge Function or Postgres views) feed dashboards: visits by city/user, pipeline value, issues by category, actions due.

## 7. Security Architecture

- **Auth:** Supabase Auth (email/password + magic link; SSO optional later). JWT carries `user_id`.
- **Authorization:** Postgres **Row Level Security** on every table, driven by the user's `role` + geographic scope (region/area). See `02-database-schema.md` for the RBAC matrix and policies.
- **Storage:** private buckets (`visit-photos`, `voice-notes`) with signed URLs; RLS-style access via Storage policies keyed to the owning visit.
- **Audit:** `audit_logs` table records create/update/delete of sensitive records.
- **PII/data residency:** isolated database & storage; no cross-tenant or cross-product joins.

## 8. Environments & Deployment (separate from VANTORA)

| Env | Frontend | Backend |
|---|---|---|
| Dev | Vite dev server | Supabase project `field-insights-dev` |
| Prod | New Vercel project `field-insights` | Supabase project `field-insights-prod` |

- Own `field-insights/.env` (`VITE_FI_SUPABASE_URL`, `VITE_FI_SUPABASE_PUBLISHABLE_KEY`) — distinct variable names to avoid any collision with VANTORA's `VITE_SUPABASE_*`.
- Own CI workflow scoped to the `field-insights/**` path; does not run or alter VANTORA pipelines.
