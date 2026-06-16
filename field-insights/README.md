# FIELD INSIGHTS

**Field Visit & Market Intelligence Platform** — a standalone, mobile-first product for managers, supervisors, trade marketing, and business development teams to document market visits, capture photo intelligence, track competitors and opportunities, log issues, drive action plans, and generate actionable market insights.

> **Status:** Phase 1 (Auth, Data Model, RBAC, Configurable Intelligence) implemented — 11 migrations applied to the separate Supabase project, configurable framework metamodel (versioned, effective-dated, company-overridable, audited) with FMCG seeded as default, RLS on every table, security hardening, Supabase Auth + typed data layer in the PWA. Builds green. **Phase 2 (visit capture + offline sync) awaits approval.** See `docs/09-phase-1-deliverables.md`.

## Run locally

```bash
cd field-insights
npm install
cp .env.example .env   # fill in VITE_FI_* (a working .env is already present in dev)
npm run dev            # http://localhost:5273
npm run typecheck && npm run build
```

---

## Isolation Guarantee (VANTORA is untouched)

FIELD INSIGHTS is an **independent product**. It does not modify, refactor, rename, migrate, merge, or impact the existing VANTORA platform in any way.

| Concern | VANTORA (existing) | FIELD INSIGHTS (new) |
|---|---|---|
| Codebase | Repo root (`/src`, `/index.html`, root `package.json`) | Self-contained `field-insights/` folder (own `package.json`, own build) |
| Database | Existing Supabase project + `supabase/migrations/*` | **Separate** Supabase project + own `field-insights/supabase/migrations/*` |
| Deployment | Existing Vercel project | **Separate** Vercel project / domain |
| Env vars | Root `.env` (`VITE_SUPABASE_*`) | Own `field-insights/.env` pointing at the new project |
| Business logic | Trade-spend domain | Field-intelligence domain — **no shared business logic** |
| Permissions/RLS | VANTORA roles & policies | Independent role model & RLS policies |

**Shared-dependency rule:** the only thing in common is generic OSS libraries (React, Vite, Supabase JS, Tailwind, etc.), installed into FIELD INSIGHTS' own `node_modules` via its own lockfile. There is no code, schema, runtime, or credential overlap. If any future need would couple the two, it will be copied/forked into this folder rather than imported from VANTORA.

---

## Design Documents

Review these in order before approving implementation:

1. [`docs/01-functional-architecture.md`](docs/01-functional-architecture.md) — system architecture, tech stack, offline-first model, integrations
2. [`docs/02-database-schema.md`](docs/02-database-schema.md) — full schema (tables, enums, relationships, RLS, RBAC matrix)
3. [`docs/03-screen-inventory.md`](docs/03-screen-inventory.md) — every screen, grouped by module, with purpose and key elements
4. [`docs/04-user-journey.md`](docs/04-user-journey.md) — end-to-end journeys per role
5. [`docs/05-mobile-ux-mockups.md`](docs/05-mobile-ux-mockups.md) — ASCII wireframes of the key mobile screens
6. [`docs/06-development-roadmap.md`](docs/06-development-roadmap.md) — phased delivery plan, milestones, estimates
7. [`docs/07-phase-0-deliverables.md`](docs/07-phase-0-deliverables.md) — **Phase 0 output:** architecture diagram, execution-graph schema, the 60-second visit UX, future-module design
8. [`docs/08-fmcg-intelligence-layer.md`](docs/08-fmcg-intelligence-layer.md) — **core FMCG layer:** Customer Health, Development Stages, Competitor Price Tracking, Opportunity Forecast, Visit Quality Score, DVAP framework
9. [`docs/09-phase-1-deliverables.md`](docs/09-phase-1-deliverables.md) — **Phase 1 output:** schema, configurable framework metamodel + governance, RBAC/RLS, security hardening, app auth

---

## Recommended Stack (summary)

- **Frontend:** React 18 + TypeScript + Vite, installed as a **PWA** (installable, offline-first).
- **UI:** Tailwind CSS + shadcn/ui (Radix), mobile-first, large touch targets.
- **State/Data:** TanStack Query (server cache) + Zustand (UI/session) + **Dexie/IndexedDB** (offline store & sync queue).
- **Backend:** Supabase (Postgres + Auth + Storage + Row Level Security + Edge Functions) — **a new, dedicated project**.
- **Maps:** react-leaflet + OpenStreetMap tiles. **Device:** Web Geolocation + `getUserMedia`/file-capture for camera; MediaRecorder for voice.
- **Reporting:** jsPDF + jspdf-autotable (client-side PDF).
- **Optional native wrapper (later phase):** Capacitor for first-class camera/GPS/background sync on iOS/Android.
