# End-to-end tests (Playwright)

E2E tests live under `e2e/` and are driven by [Playwright](https://playwright.dev).
They are completely separate from the Vitest unit/integration suites — Vitest is
scoped to `src/**/*.test.ts` and explicitly excludes `e2e/**`, so `npm test` and
`npm run test:db` never touch these.

## Smoke suite (no database, no real auth)

`e2e/smoke.spec.ts` runs against the app booted with **placeholder Supabase
env**. It covers the critical public surface:

- `/` (landing) returns 200 and shows the **AMS** brand.
- `/login` renders the form (email + password), shows the language toggle, and
  defaults to `<html dir="rtl">` (Arabic is the default locale).
- i18n: toggling the language flips `<html dir>` to `ltr` and surfaces the
  English **"Sign in"** label, then toggles back to `rtl`.
- Auth gate: visiting `/dashboard` while unauthenticated redirects to `/login`.

### Run it locally

```bash
# one-time: download the Chromium browser Playwright drives
npx playwright install chromium

npm run test:e2e        # headless smoke run (builds + starts the app first)
npm run test:e2e:ui     # interactive Playwright UI mode
```

The `webServer` in `playwright.config.ts` runs `npm run build && npm run start`
and injects placeholder Supabase values
(`NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_placeholder`) unless you've already
exported real ones. Outside CI it reuses an already-running dev/prod server on
`http://localhost:3000`.

## Authenticated flows (gated on a seeded tenant)

`e2e/authenticated.spec.ts` is a documented placeholder for deeper flows that
need a real, seeded Supabase tenant. It **self-skips** (does not fail) unless all
three are set:

```bash
export E2E_BASE_URL=https://staging.example.com   # a running app w/ real backend
export E2E_TEST_EMAIL=tester@example.com          # a seeded test-tenant login
export E2E_TEST_PASSWORD=...
npm run test:e2e
```

When enabled it logs in through the UI and asserts the app routes away from
`/login` to an authenticated home. Extend this file as more seeded flows become
available.

## CI

`.github/workflows/e2e.yml` runs the smoke suite on every push/PR: it installs
deps (`npm ci`), installs the Chromium browser, sets the placeholder Supabase
env at the job level, and runs `npm run test:e2e`. The authenticated spec
self-skips there. The `playwright-report/` HTML report is uploaded as an artifact
(`if: always()`). This workflow is independent of `ci.yml`.
