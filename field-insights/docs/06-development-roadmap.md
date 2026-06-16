# 06 — Development Roadmap

Phased, shippable increments. Estimates are calendar weeks for a small team (1–2 engineers); adjust to capacity. Each phase ends in a demoable build deployed to the **separate** FIELD INSIGHTS environments.

## Phase 0 — Foundation & Isolation (Week 1)
**Goal:** scaffold the standalone app and backend with zero VANTORA coupling.
- Create new Supabase project (`field-insights-dev`) — separate DB, Auth, Storage.
- Scaffold `field-insights/` Vite + React + TS app (own `package.json`, own lockfile, own `.env` with `VITE_FI_*` vars).
- Tailwind + shadcn/ui setup, app shell, bottom-nav, theming, i18n bootstrap.
- PWA setup (manifest, service worker, install prompt).
- CI workflow scoped to `field-insights/**` only.
- **Exit:** app boots, "Hello FIELD INSIGHTS" installable PWA, CI green, VANTORA untouched.

## Phase 1 — Auth, Data Model & RBAC (Week 2)
**Goal:** secure backbone.
- Migrations: all enums + tables from `02-database-schema.md`.
- RLS policies + helper functions; seed regions/areas/roles.
- Supabase Auth wiring (sign in/out, reset, session restore).
- Profile bootstrap on first login; role/scope enforcement end-to-end.
- Admin: Users & roles, Regions & areas, Customers, Competitor catalog (basic CRUD).
- **Exit:** users sign in, scoped data access proven, master data manageable.

## Phase 2 — Visit Management + GPS (Weeks 3–4)
**Goal:** the core capture loop online.
- Start Visit flow (customer → location → GPS capture → type/objective).
- Visit detail hub (overview/edit, start/end, status lifecycle).
- Geofence validation (`gps_in_range`).
- Visits list with filters; Visits map (react-leaflet, clustering).
- **Exit:** a full visit can be created, geo-stamped, completed, and viewed on a map.

## Phase 3 — Offline-First Engine (Weeks 5–6)
**Goal:** field-grade reliability.
- Dexie schema mirroring core tables; optimistic writes.
- Sync queue (idempotent by UUID), background flush, retry/backoff.
- Blob handling for photos/audio in IndexedDB → Storage on reconnect.
- Sync Center UI; per-record sync badges; conflict (last-write-wins) handling.
- **Exit:** create a complete visit fully offline; it syncs cleanly on reconnect.

## Phase 4 — Capture Modules (Weeks 7–9)
**Goal:** all observation types.
- **Photo Intelligence:** camera capture, category/description, gallery, viewer, GPS/time stamping.
- **Competitor Tracking:** observation form + photos.
- **Voice Notes:** MediaRecorder capture, upload, list/play; transcription via Edge Function (queued, async).
- **Opportunities:** list/kanban, form, detail, status flow.
- **Issues:** list, form, detail, resolution.
- **Action Plans:** create from visit, "My Actions", complete.
- **Exit:** every core module from the brief is functional offline + online.

## Phase 5 — Dashboards & Reporting (Weeks 10–11)
**Goal:** turn data into insight.
- Reporting views/materialized rollups.
- Executive dashboard + visits/pipeline/competitor/issues dashboards (Recharts).
- Reports: client PDF (Visit, Opportunity, Competitor, Customer Visit History).
- Market Intelligence Report via `build-report` Edge Function (server PDF → Storage/email).
- **Exit:** managers get live dashboards and exportable reports.

## Phase 6 — Hardening & Launch (Week 12)
**Goal:** production-ready.
- Performance (bundle splitting, image compression, lazy maps/charts).
- Accessibility & RTL pass; full i18n strings.
- Security review of RLS + Storage policies; audit logging verified.
- Error tracking, analytics, empty/loading/error states.
- Production Supabase + Vercel projects; runbook in `DEPLOYMENT.md`.
- UAT with a pilot field team.
- **Exit:** production launch to pilot users.

## Phase 7 — Optional Native (post-MVP, 2–3 weeks)
- Wrap with **Capacitor** for native camera/GPS/background sync + push, store distribution (iOS/Android). Reuses the same web codebase.

---

## MVP cut (if a faster first release is needed)
Phases 0–4 minus voice transcription and kanban polish = a usable field app: **auth + scoped data + offline visits with photos, competitors, opportunities, issues, actions, and the visits map.** Dashboards/reports (Phase 5) follow immediately after.

## Milestone summary
| Phase | Weeks | Headline deliverable |
|---|---|---|
| 0 | 1 | Isolated scaffold + PWA + CI |
| 1 | 2 | Auth + schema + RBAC + master data |
| 2 | 3–4 | Visits + GPS + map |
| 3 | 5–6 | Offline engine + sync |
| 4 | 7–9 | All capture modules |
| 5 | 10–11 | Dashboards + reports |
| 6 | 12 | Hardening + launch |
| 7 | +2–3 | Optional native apps |

## Risks & mitigations
| Risk | Mitigation |
|---|---|
| Accidental VANTORA coupling | Hard folder/DB/deploy separation; distinct env var names; path-scoped CI |
| Offline conflict edge cases | UUID + append-only children + last-write-wins + audit trail |
| Photo storage cost/size | Client-side compression, signed URLs, lifecycle rules |
| Voice transcription cost/latency | Async queue, optional/feature-flag, store audio regardless |
| GPS accuracy indoors | Capture accuracy, geofence flag (warn, don't block), manual pin adjust |
