# NEXT_STEPS

Prioritized roadmap to take SalesBook from "production-ready app" to "fully operated product."

## P0 — Ship it
1. **Push branch + open the draft PR** (DEPLOYMENT.md §2).
2. **Deploy to Vercel** and capture Production + Preview URLs (DEPLOYMENT.md §3).
3. **Post-deploy smoke test** on the live URL (TEST_REPORT.md §7 / DEPLOYMENT.md §7).

## P1 — Durable backend & auth
4. **Provision Supabase** and set `DATA_BACKEND=supabase` — apply `supabase/schema.sql`. The
   `SupabaseStore` adapter is ready; verify against the live project and add error/retry handling.
5. **Implement `SupabaseAuthProvider`** — phone OTP (matches the `+966` login) or email/OAuth via
   Supabase Auth. Add server sessions (JWT/cookies), route protection, and the role model
   (`super_admin … rep`) already typed in `src/lib/auth`.
6. **Wire real file storage** — implement upload endpoints using `StorageProvider`
   (`STORAGE_BACKEND=supabase`), and connect the report wizard's photo step + profile/gallery.
7. **Migrate content to the DB** — move `src/lib/seed.ts` data into the normalized tables and add
   a seed script; enable Row-Level Security per company (scaffolded in `schema.sql`).

## P2 — Quality & performance
8. **Automated tests** — Vitest for `lib` (tokens, deco, store adapters, seed integrity) and
   Playwright e2e for the flows already covered by the QA harness; run in CI.
9. **CI pipeline** — GitHub Actions: typecheck + lint + build + e2e on every PR; Vercel preview per PR.
10. **Self-host fonts** — replace the Google Fonts `@import` with `next/font/local` (IBM Plex) to
    remove the external request and eliminate the CDN dependency.
11. **Full accessibility audit** — convert custom clickable `<span>`/`<div>` to `<button>` or add
    `role="button"`/`tabindex`/keyboard handlers app-wide; run axe-core; verify screen-reader flows
    in both RTL and LTR; check color-contrast tokens in dark mode.
12. **Images** — replace placeholder tiles with real optimized images (`next/image`) once storage
    is live.

## P3 — Product depth (from the original PRD not yet built)
13. **English content parity** — complete EN copy for all long-form data.
14. **Offline mode** — service worker + local cache + background sync (the UI already surfaces an
    offline banner and "saved locally" affordance).
15. **Duplicate detection & smart reminders** — the PRD's server-side intelligence (90-day staleness,
    phone re-verification, merge suggestions) as background jobs.
16. **Reputation & verification pipelines** — point accrual, badge unlocks, multi-rep verification
    counts backed by real events.
17. **Company isolation & admin console** — multi-tenant separation and a web admin surface for
    approvals/reviews at scale.
18. **Push notifications** — real delivery for approvals, mentions, payment-status changes.

## P4 — Nice-to-have
19. **URL-based routing** — optionally map screens to real routes for deep-linking/SEO (currently a
    single-route SPA with History-API back/forward).
20. **Analytics & error monitoring** — Vercel Analytics + Sentry.
