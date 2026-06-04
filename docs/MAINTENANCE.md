# VANTORA Business OS — Maintenance & Operations

Run, monitor, troubleshoot, and safely change production. See `ARCHITECTURE.md`
for the system, `OWNER_GUIDE.md` for owner operations, `BACKUPS.md` / `STAGING.md`
for backup + staging details.

---

## 1. Monitoring

- **Errors (Sentry):** env-gated — active only when `NEXT_PUBLIC_SENTRY_DSN` is
  set in Vercel. Tags environment (production/preview/development) + release
  (commit); scrubs PII; filters noise; optional session replay. Watch the issue
  stream after each deploy.
- **Deployments (Vercel):** each push builds; production builds from the
  production branch. Confirm the latest deployment reaches **READY** and serves
  the expected commit SHA.
- **Database (Supabase):** the **security advisor** (run after every migration —
  target 0 ERROR, no `anon`-executable app functions, no RLS-disabled tables) and
  the **performance advisor**; logs and slow queries in the dashboard.
- **CI signals:** Typecheck & build, Integration tests (DB), Playwright smoke,
  and the **staging migration dry-run** must be green on every PR.
- **App health:** subscription gating, notification bell counts, and import/export
  job history (`erp_import_jobs`) surface operational state in-product.

---

## 2. Troubleshooting

| Symptom | First checks |
|---|---|
| User sees no data / "permission" errors | RLS: confirm the user's `company_id`/role; impersonate (set `role authenticated` + `request.jwt.claims`) and re-run the query; check the relevant policy. |
| Platform staff redirected to `/onboarding` | They must be active platform staff (`erp_is_platform_staff()` true). Check `erp_platform_staff.is_active`. |
| Staff can't see a platform page | Check their effective permissions: `select erp_platform_my_permissions()` as that user; verify role defaults + overrides. |
| Import fails on `.xlsx` | Server parses Excel; check the file isn't password-protected and the server-action body-size limit (15 MB). CSV is the fallback. |
| Export download empty | Filters too strict, or the user lacks the entity's permission; check the count preview. |
| "Database error saving new user" | Auth trigger / `search_path` (see migrations 0030–0031 pattern); confirm edge function secrets. |
| Migration fails on staging in CI | The from-zero chain broke — fix the offending migration; keep everything additive/idempotent. |
| Security advisor flags `anon`-executable function | A new SECURITY DEFINER function missed its `revoke … from public, anon` — add a small revoke migration (pattern: `0085`). |

General method: reproduce against **staging** or via **RLS impersonation in a
rolled-back transaction** on production — never debug by mutating production data.

---

## 3. Rollback procedures

- **App (fastest):** in Vercel, **promote/rollback** to the previous READY
  deployment. Code is stateless; this is instant and safe.
- **Migrations:** all migrations are **additive** — a new feature's table/policy
  being present is harmless to old code. Prefer **rolling forward** with a
  corrective additive migration over destructive `down` migrations.
  - To neutralize a bad **policy**: `drop policy` the new (additive) policy — this
    only removes the newly granted access; existing policies are untouched.
  - To neutralize a bad **function grant**: re-`revoke`/`grant` as needed.
  - Avoid `drop table`/`drop column` on production; data loss is rarely
    reversible without a restore.
- **Data corruption:** restore via **Supabase PITR** to just before the incident
  (preferred), or a logical `pg_dump` restore into a scratch DB → verify →
  cut over. See `BACKUPS.md`.
- **Edge functions:** redeploy the previous version (functions are versioned).

---

## 4. Migration process (production-safe)

The reviewed process used for every schema change (e.g. `0082`–`0085`):

1. **Author** the migration as a numbered file in `supabase/migrations/`.
   Additive + idempotent: `create … if not exists`, `drop policy if exists`,
   `on conflict do nothing`. New SECURITY DEFINER functions pin `search_path` and
   `revoke … from public, anon`.
2. **Verify locally:** `tsc`, unit tests, `next build` green.
3. **PR / CI:** the **Apply migrations to STAGING** job replays the whole chain
   from zero — this is the dry run. Must be green.
4. **Apply to production** (reviewed): confirm prerequisites (prior migrations
   present, target objects absent) → `apply_migration` → **verify schema**
   (tables/policies/triggers/functions/seed) → run the **security advisor** →
   **RLS-impersonation** verification of each persona (rolled back) → confirm
   **no residue**.
5. **Merge** the PR → production deploys. Re-confirm deployment READY + advisor.

Never apply a production migration outside this process. Keep `external_id` and
the standard-field contract on any new entity.

---

## 5. Release checklist

Before merging to the production branch:

- [ ] `tsc --noEmit` clean.
- [ ] Unit tests green (`vitest run`); i18n **ar/en parity** test passing.
- [ ] `next build` succeeds; new routes present.
- [ ] New SECURITY DEFINER functions: `search_path` pinned + `anon`/`public`
      EXECUTE revoked.
- [ ] New tables: RLS enabled + policies for every needed command; standard
      entity fields present.
- [ ] Migrations additive/idempotent; **staging dry-run green** in CI.
- [ ] No secrets added to the DB, code, or commit messages.
- [ ] Audit logging on any new sensitive mutation.
- [ ] PR description states what changed + verification done.

After merge:

- [ ] Production deployment reaches **READY** on the expected SHA.
- [ ] Migrations applied to the live DB via the reviewed process (if any).
- [ ] **Security advisor** re-checked (0 ERROR; no new `anon`-executable fns).
- [ ] Spot-check the changed feature in production (or note the verification
      boundary if a live UI/session check isn't possible from the toolchain).
- [ ] Tag/record the milestone.
