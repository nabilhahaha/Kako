# Roshen Visit Log

A premium, iPhone-native-feeling web app for documenting Roshen customer visits — a
single-user professional diary of visits with photos, notes and GPS. Not a CRM, not
multi-user: just a fast, elegant personal log.

Built with React + TypeScript + Vite, Tailwind, Supabase, React Query, React Router,
Framer Motion, Lucide, React Hook Form and Zod. Installable as a PWA with offline
support and background sync.

## Features

- **Dashboard** — today / this week / this month counts, quick New Visit, latest visits.
- **Customers** — add, edit, delete, instant search, and Excel/CSV import with automatic
  column matching (Name required; Code, City, Area, Address, Phone, Notes, Lat/Lng optional).
- **New Visit** — pick customer, auto date/time, 1–20 compressed photos with live preview,
  visit type, status, notes, and automatic GPS capture (with a static map pin + Google Maps link).
- **Customer history** — per-customer visit timeline, newest first, exportable to PDF / Excel / CSV.
- **Visit details** — full record with photo grid, fullscreen swipeable lightbox, map and actions.
- **Gallery** — filter photos by customer, date, visit type and status; grid + lightbox.
- **Global search** — customers (name/code) and visits (notes/type).
- **Statistics** — 8 stat cards plus 14-day activity and type/status breakdown charts.
- **Extras** — dark mode, offline outbox with auto-sync, pull-to-refresh, image compression,
  lazy loading, and PWA install.

## Data

Supabase project **Roshen** (`wrkugzssuoxneftzappa`):

- Tables `customers`, `visits`, `visit_photos` — all owner-scoped with row-level security.
- Private storage bucket `visit-images` (paths `<user_id>/<visit_id>/<file>.jpg`).
- Email/password auth, single account, no roles.

Schema lives in [`supabase/migrations`](./supabase/migrations) and was applied as the
`visit_log_init` migration.

## Getting started

```bash
npm install
cp .env.example .env   # fill in your Supabase URL + publishable key
npm run dev
```

Build: `npm run build` (regenerates PWA icons, typechecks, then bundles).
Type-check only: `npm run typecheck`.

### Environment

| Variable | Description |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key |

## Deployment

Any static host works. The included [`vercel.json`](./vercel.json) sets up SPA
rewrites and correct caching for the service worker and hashed assets. Set the two
environment variables above in your host, then deploy the `dist/` output.

## Project structure

```
src/
  components/   ui kit, layout shell, customers, visits, photos, map, stats
  hooks/        auth, theme, geolocation, React Query queries + mutations
  lib/          supabase client, api, exporters, image compression, offline outbox, sync
  pages/        login, dashboard, customers, visits, gallery, search, stats, settings
public/         PWA manifest, service worker, generated icons
supabase/       SQL migration for schema, RLS and storage
```
