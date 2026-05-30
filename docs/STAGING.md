# Staging & database promotion runbook

This document describes how we run a **staging** environment for the database and
how schema changes flow from development to production safely.

## Why staging matters

Historically, migrations in `supabase/migrations/*.sql` were applied **directly to
the live production database**, and demo / sales accounts shared the same live
data as paying tenants. That is risky:

- A bad migration (a typo, a destructive `DROP`, a missing `WHERE`) hits real
  customer data with no rehearsal.
- There is no isolated place to test a migration chain end-to-end before it
  touches production.
- Demo accounts mutating live data can corrupt or leak real tenant data in a
  multi-tenant SaaS.

A staging database fixes this: every schema change is applied to a **throwaway,
production-shaped database first**, verified, and only then promoted to
production through a deliberate manual step.

## Staging options

There are two reasonable ways to get a production-shaped staging database on
Supabase.

### Option A — Supabase branching (preview branches) — RECOMMENDED

Supabase **branching** spins up an ephemeral, isolated Postgres instance that is
seeded from your project's migrations. It is the lightest-weight option: branches
are cheap, reset-able, and tear down automatically, which matches our model where
**staging is expected to be reset-able** (our migrations are not guaranteed
idempotent, so re-applying onto a dirty DB can fail).

Recommended because:

- No second project to keep in sync or pay for full-time.
- A branch is created/reset per change, so you always migrate onto a clean DB.
- It maps cleanly onto the `migrate-staging` workflow, which assumes the staging
  DB can be wiped and rebuilt from the full migration chain.

Setup steps:

1. In the Supabase dashboard, open your project → **Branches** and enable
   branching (requires a paid plan; branching uses compute).
2. Create a persistent branch named `staging` (or create a preview branch per
   feature). This provisions an isolated Postgres database.
3. Copy that branch's **pooler connection string** (see
   "Where to get the connection string" below).
4. Store it as the GitHub Actions secret `STAGING_DATABASE_URL`.
5. When staging drifts or a migration re-run is needed, **reset the branch** in
   the dashboard (or recreate it) rather than trying to re-apply onto a dirty DB.

### Option B — a separate Supabase project

Create a second, standalone Supabase project (e.g. `myapp-staging`) that mirrors
production's region and settings. Use its connection string as
`STAGING_DATABASE_URL`.

Trade-offs:

- More isolated and longer-lived (good if you want a stable staging URL for a
  deployed staging app), but it is a second project to pay for and keep in sync.
- To reset it, you must drop/recreate the schema (e.g. `DROP SCHEMA public
  CASCADE; CREATE SCHEMA public;`) before re-running migrations, since the
  migration chain is not idempotent.

> Recommendation: use **Option A (branching)** unless you also need a permanently
> deployed staging copy of the app, in which case Option B is justified.

## Where to get the Supabase connection string

For each environment (staging and production):

1. Supabase dashboard → **Project Settings → Database → Connection string**.
2. Use the **Connection pooler** string (Transaction or Session pooler), not the
   direct connection — CI runners connect over IPv4 and the pooler is the
   reliable path.
3. Ensure it ends with `?sslmode=require` (Supabase requires TLS).
4. The format looks like (do **not** commit a real one):

   ```
   postgresql://postgres.<project-ref>:<password>@<region>.pooler.supabase.com:6543/postgres?sslmode=require
   ```

## Required GitHub Actions secrets

Add these under **GitHub repo → Settings → Secrets and variables → Actions →
New repository secret**. Nothing in this repo hardcodes any of them; every
workflow no-ops cleanly if the relevant secret is absent.

| Secret | Used by | Purpose |
| --- | --- | --- |
| `STAGING_DATABASE_URL` | `migrate-staging.yml` | Staging DB pooler string (`sslmode=require`). |
| `PRODUCTION_DATABASE_URL` | `backup.yml`, `migrate-staging.yml` (manual job) | Production DB pooler string. Used for daily backups and the **manual** production migrate job. |
| `BACKUP_GPG_PUBLIC_KEY` | `backup.yml` | *(optional)* Armored GPG **public** key; if set, dumps are encrypted to this recipient. |
| `BACKUP_S3_BUCKET` | `backup.yml` | *(optional)* S3 (or S3-compatible) bucket name for off-CI backup storage. |
| `BACKUP_S3_ENDPOINT` | `backup.yml` | *(optional)* Endpoint URL for S3-compatible providers (e.g. Supabase Storage S3, Cloudflare R2, Backblaze B2). |
| `BACKUP_S3_ACCESS_KEY_ID` | `backup.yml` | *(optional)* S3 access key id. |
| `BACKUP_S3_SECRET_ACCESS_KEY` | `backup.yml` | *(optional)* S3 secret access key. |

If the `BACKUP_S3_*` set is absent, backups fall back to a GitHub Actions
artifact with 7-day retention (see `docs/BACKUPS.md`).

## Promotion flow: develop → staging → production

```
  feature branch ──► develop / claude/** ──► (push)
                                              │
                                              ▼
                              migrate-staging.yml  (AUTOMATIC)
                              applies migrations to STAGING
                                              │
                                              ▼
                                     verify on staging
                              (smoke test the app + queries)
                                              │
                                              ▼
                          migrate-staging.yml  (MANUAL, guarded)
                          workflow_dispatch, target = PRODUCTION
                          + production environment approval
                                              │
                                              ▼
                                     deploy the app
```

Step by step:

1. **Develop.** Open a PR, add any new migration as the next-numbered file in
   `supabase/migrations/` (e.g. `0099_my_change.sql`). CI (`ci.yml`) builds the
   full schema from scratch against a throwaway Postgres to prove the chain
   still applies.
2. **Auto-migrate staging.** On push to `develop`, `staging`, or `claude/**`,
   `migrate-staging.yml` applies every `supabase/migrations/*.sql` in filename
   order to `STAGING_DATABASE_URL`. If staging is dirty (migrations aren't
   idempotent), **reset the Supabase branch / staging schema first** and re-run.
3. **Verify.** Exercise the change against staging — run app smoke tests, check
   row counts, RLS, and the specific tables your migration touched.
4. **Back up production.** Trigger `backup.yml` via *Run workflow* (or rely on
   the nightly run) so a fresh production dump exists **before** you migrate.
5. **Apply to production (manual).** Production migration is **intentionally not
   automated**. Go to **Actions → Migrate database → Run workflow**, set
   `target` to exactly `PRODUCTION`. The `migrate-production` job:
   - only runs on manual `workflow_dispatch`,
   - refuses unless `target` is typed exactly as `PRODUCTION`,
   - is gated on the `production` GitHub Environment (add required reviewers
     there for a second approval),
   - no-ops if `PRODUCTION_DATABASE_URL` is unset.

   Alternatively you can apply manually from a trusted machine:

   ```sh
   # Ensure a fresh backup exists first (see docs/BACKUPS.md).
   export PRODUCTION_DATABASE_URL='...pooler...sslmode=require'   # do not commit
   for f in supabase/migrations/*.sql; do
     echo "applying $f"
     psql "$PRODUCTION_DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
   done
   ```

6. **Deploy.** Deploy the application that depends on the new schema.

## Related files

- `.github/workflows/migrate-staging.yml` — auto staging + manual production migrate.
- `.github/workflows/backup.yml` — scheduled production backups.
- `supabase/ci/setup-test-db.sh` — the migration-ordering logic these workflows mirror.
- `docs/BACKUPS.md` — backup & restore strategy and the restore drill.
