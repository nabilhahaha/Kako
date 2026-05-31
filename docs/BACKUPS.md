# Database backup & restore strategy

This describes how the database is backed up, where dumps go, how they are
secured, and a step-by-step **restore drill** you can run against staging.

## Primary safety net: enable Supabase managed backups / PITR

> **Strongly recommended.** The single most important thing you can do is enable
> Supabase's managed backups on a paid plan:
>
> - **Daily managed backups** (retained per plan), and ideally
> - **Point-in-Time Recovery (PITR)** for fine-grained recovery to any second
>   within the retention window.
>
> Enable in the Supabase dashboard → **Project Settings → Database → Backups /
> Point in Time Recovery**. This is your primary recovery mechanism: it is
> consistent, automatic, and recoverable from the dashboard.

The `pg_dump`-based backups described below are a **portable secondary** copy:
provider-independent, downloadable, and restorable into any Postgres (including a
local instance or a different provider). They protect against the case where you
lose access to Supabase itself, and they double as the source for the restore
drill.

## How the automated backup works

Workflow: `.github/workflows/backup.yml`. It uses `scripts/backup.sh` (which runs
`pg_dump`) under the hood.

- **Schedule:** daily at `0 2 * * *` (~02:00 UTC), plus on-demand via
  **Actions → Database backup → Run workflow** (`workflow_dispatch`).
- **What it dumps:** the production database referenced by the
  `PRODUCTION_DATABASE_URL` secret, in **custom** format, gzipped, with
  `--no-owner --no-privileges` (so it restores cleanly into a different role).
- **Guarded:** if `PRODUCTION_DATABASE_URL` is not set, the workflow emits a
  notice and exits 0 (no-op). Nothing is hardcoded.
- **Never leaks:** secrets are passed via `env:` only, never inlined into shell
  or printed; dump contents are never echoed.

### Encryption (optional)

If the `BACKUP_GPG_PUBLIC_KEY` secret is set (an **armored GPG public key**), the
workflow imports it into a temporary keyring and encrypts the dump to that
recipient (`gpg --encrypt --recipient ...`), producing a `.gpg` file; the
unencrypted dump is deleted before upload. Only the holder of the matching
**private** key can decrypt it.

Create a keypair (keep the private key off the repo and out of CI):

```sh
gpg --quick-generate-key "backups@yourdomain" default default never
gpg --armor --export backups@yourdomain   # paste THIS public block into BACKUP_GPG_PUBLIC_KEY
gpg --armor --export-secret-keys backups@yourdomain > backup-private.asc  # store offline / in a vault
```

### Where dumps go (storage + retention)

- **If the `BACKUP_S3_*` secrets are set** (`BACKUP_S3_BUCKET`, and for
  S3-compatible providers `BACKUP_S3_ENDPOINT`, `BACKUP_S3_ACCESS_KEY_ID`,
  `BACKUP_S3_SECRET_ACCESS_KEY`): the dump is uploaded with `aws s3 cp` to
  `s3://<bucket>/db-backups/<filename>` (passing `--endpoint-url` for
  S3-compatible providers such as Supabase Storage S3, Cloudflare R2, or
  Backblaze B2). **Set retention with a bucket lifecycle policy** at the
  provider — e.g. expire `db-backups/` objects after 30 days, or transition older
  ones to cold storage.
- **Otherwise (fallback):** the dump is uploaded as a GitHub Actions artifact
  named `db-backup` with **`retention-days: 7`**. This is fine for a stopgap but
  is short-lived and tied to the repo — configure S3 for durable retention.

### Recommended retention

| Tier | Mechanism | Suggested retention |
| --- | --- | --- |
| Primary | Supabase managed daily backups / PITR | per plan (7+ days; PITR window) |
| Secondary (this repo) | pg_dump → S3 lifecycle | 30 days (daily), longer for monthly if desired |
| Fallback | GitHub Actions artifact | 7 days |

## Manual backup (local / ad hoc)

```sh
export DATABASE_URL='postgresql://...pooler...sslmode=require'   # do not commit
scripts/backup.sh                 # plain gzipped SQL → backups/<db>-<UTC>.sql.gz
scripts/backup.sh --format=custom # custom format     → backups/<db>-<UTC>.dump.gz
```

`backup.sh` exits with a clear error if `DATABASE_URL` is unset or `pg_dump` is
not installed.

## Restore drill (run against STAGING)

Run this periodically (e.g. monthly) to prove backups are actually restorable.
**Always target staging, never production**, unless this is a real disaster
recovery.

1. **Get a dump.**
   - From S3: `aws s3 cp s3://<bucket>/db-backups/<file> ./ --endpoint-url <endpoint>`
   - Or from a GitHub Actions run: download the `db-backup` artifact and unzip it.

2. **Decrypt, if it is a `.gpg` file** (needs the private key):

   ```sh
   gpg --decrypt mydb-20260530T020000Z.dump.gz.gpg > mydb-20260530T020000Z.dump.gz
   ```

3. **Point at STAGING** (double-check the host — this is destructive):

   ```sh
   export DATABASE_URL='postgresql://...STAGING...pooler...sslmode=require'
   ```

4. **Restore.** `restore.sh` requires the explicit `--yes` flag and prints a loud
   destructive-overwrite warning; without `--yes` it refuses to run.

   ```sh
   scripts/restore.sh --yes mydb-20260530T020000Z.dump.gz
   ```

   It auto-detects format by extension:
   - `*.dump` / `*.dump.gz` → `pg_restore --clean --if-exists --no-owner --no-privileges`
   - `*.sql` / `*.sql.gz`   → `psql`
   - `*.gpg`                → refuses and tells you to decrypt first (step 2)

5. **Verify.** Connect to staging and confirm the schema and key tables look
   right (row counts, a few representative tenant rows, RLS still enabled):

   ```sh
   psql "$DATABASE_URL" -c '\dt'
   psql "$DATABASE_URL" -c 'select count(*) from <a_known_table>;'
   ```

6. **Record the result** (date, dump used, time-to-restore) so you know the
   recovery path works and roughly how long it takes.

## Restoring production (disaster recovery only)

Prefer **Supabase PITR / managed backup restore from the dashboard** — it is
consistent and the supported path. Use a `pg_dump` restore into production only
if Supabase's own restore is unavailable. In that case follow the same
`restore.sh --yes` steps but with `DATABASE_URL` pointed at production, after
confirming you have a fresh separate backup of the current (broken) state.

## Related files

- `.github/workflows/backup.yml` — scheduled / on-demand backup workflow.
- `scripts/backup.sh` — `pg_dump` wrapper.
- `scripts/restore.sh` — guarded, destructive restore.
- `docs/STAGING.md` — staging setup and the required GitHub secrets.
