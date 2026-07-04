# PROJECT_STATUS

**Project:** SalesBook — Customer Intelligence Platform for FMCG sales teams
**Branch:** `feature/final-production`
**Status:** ✅ Production-ready (application code, QA passing). Deployment + remote push pending credentials (see DEPLOYMENT.md).
**Last verified:** production build + headless QA all green.

---

## 1. What this is
A mobile-first web application implementing the SalesBook design (from `project/SalesBook.dc.html`):
a "know your customer before you visit" intelligence platform. Arabic-RTL first with a full
English (LTR) mirror, light & dark themes, 23 screens, and a real backend API.

## 2. Stack
| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| UI | React 19, TypeScript (strict) |
| Styling | Ported design token system (CSS variables) — no CSS framework, pixel-faithful |
| Backend | Next.js Route Handlers + pluggable `DataStore` (file today, Supabase/Postgres adapter ready) |
| i18n | Custom bilingual layer (`{ ar, en }`) with live language + direction switching |
| Lint/Types | ESLint (`next/core-web-vitals`), `tsc --strict` |

## 3. Feature status
| Area | Status |
|---|---|
| Authentication (login / register / pending) | ✅ Demo provider via `AuthProvider` abstraction |
| Customer Directory | ✅ filter (city / late / stale), sort (newest / nearest), skeletons |
| Customer Profile (7 tabs) | ✅ 30-second KYC, contacts, payment, movement, notes, gallery, posts |
| History Timeline | ✅ immutable change log with approval status |
| Notes / Gallery / Posts | ✅ timeline, media tiles, like/comment, tabs |
| Search | ✅ customers + contacts, recents, empty state |
| Notifications | ✅ mark-all-read (persisted), deep-link routing |
| Messages / Chat | ✅ threads, shared customer card, voice bubble, typing indicator, send (persisted) |
| Groups / Events | ✅ join / RSVP toggles |
| Leaderboard / Company / Careers | ✅ ranks, follow, apply, availability toggle |
| Membership Approval | ✅ approve / reject (reason sheet) / more-info — persisted via API |
| Review Queue | ✅ approve / reject / request-changes — persisted via API |
| Report Wizard | ✅ 8 steps with validation + success |
| Language switching (AR/EN) + RTL/LTR | ✅ live, persists across refresh, `<html lang/dir>` synced |
| Dark / Light theme | ✅ live, persists across refresh |
| Responsiveness (mobile/tablet/desktop) | ✅ no horizontal overflow at 375 / 768 / 1440 |
| Browser Back / Forward | ✅ wired to in-app navigation via History API |
| Refresh persistence | ✅ nav + theme + language restored; workflow data persisted server-side |
| Error boundaries | ✅ per-screen recoverable fallback |
| Loading skeletons | ✅ directory + lazy-screen fallbacks |
| Performance / bundle | ✅ heavy screens code-split; `/` First Load JS ≈ 130 kB |
| Accessibility | ◑ focus-visible, `role=switch`/`aria`, decorative icons, alert/status roles — broader audit in NEXT_STEPS |
| No console / runtime / TS errors | ✅ clean |
| Production build | ✅ passes |

Legend: ✅ done · ◑ improved, further work planned (see NEXT_STEPS.md).

## 4. Production hardening delivered
- **Pluggable persistence** — `DataStore` interface with a file adapter (default) and a
  dependency-free Supabase/Postgres adapter, selected by `DATA_BACKEND`.
- **Storage abstraction** — `StorageProvider` (local / Supabase Storage / S3-ready).
- **Auth abstraction** — `AuthProvider` (demo / Supabase scaffold), routes depend on the interface.
- **Supabase prep** — `supabase/schema.sql` (JSONB doc + normalized target model + RLS scaffolding), `.env.example`.
- **Perf** — `next/dynamic` code-splitting of 15 heavy screens with skeleton fallbacks.
- **Resilience** — React error boundary around the active screen.
- **A11y** — keyboard-operable switches, focus rings, `<html lang/dir>` sync, ARIA roles.
- **Hygiene** — ESLint clean, no unused imports/locals, strict typecheck clean.

## 5. Repository map
See `SALESBOOK.md` for the full architecture walkthrough. Key paths:
`src/app/api/*` (backend), `src/lib/db|storage|auth` (abstractions), `src/lib/seed.ts` (bilingual
content), `src/state/*` (i18n + app state machine), `src/components/screens/*` (23 screens).
