# Deployment Gate Design — prevent code/schema drift

> Design only — not implemented; no production change. Prepared `2026-06-04`.
> Root-cause fix for the invoicing incident: application code that needed
> migration `0118` was deployed while production was behind, so every invoice
> save failed. This gate makes that class of failure impossible to ship.

## Principle
**A production deploy must be blocked unless the target database has applied
every migration the build depends on.** Code and schema move together or not at
all.

## Components

### 1. Migration ↔ DB reconciliation check (the gate)
- Compute the **required migration set** for the build (all files in
  `supabase/migrations/`), and the **applied set** on the target DB
  (`supabase_migrations.schema_migrations`).
- **Block** if any required migration is unapplied on the target.
- First fix the **version-scheme mismatch** (numeric prefix `00XX_` vs the live
  timestamp `version`s) so the comparison is reliable — standardise on one
  convention as part of this work.

### 2. Wire into the promotion path
- Run the gate as a **required status check** before the Vercel *production*
  promotion (and on the merge-to-main PR). A red gate = no production deploy.
- Preview/staging deploys are exempt (they target non-prod DBs).

### 3. Schema-cache reload step
- Every migration apply ends with `NOTIFY pgrst, 'reload schema'` (or the Supabase
  equivalent) so the API sees new columns immediately (the manual step we did for
  `0118` becomes automatic).

### 4. Post-deploy smoke gate
- After deploy, an automated probe asserts **invoice creation works** (synthetic
  tenant or create-and-rollback). Failure → alert + auto-rollback candidate.

### 5. Drift-detection monitor (scheduled)
- A periodic job compares repo migrations vs each env's applied set and **alerts**
  when an env falls behind — catching drift between deploys.

### 6. Safe migration apply (replace `migrate-production`)
- Rewrite the production migration job to apply **only pending, idempotent**
  migrations in order (never a blind full replay), record them under the
  standardised convention, and require the backup/PITR pre-flight gate.

## Rollout (later, behind the stabilization work)
1. Standardise `schema_migrations` convention + reconciliation script.
2. Add the gate as a non-blocking *warn* first (observe), then flip to *blocking*.
3. Add schema-reload + post-deploy smoke + drift monitor.
4. Replace `migrate-production` with the apply-pending-only job.

## Acceptance
- [ ] A deploy with an unapplied required migration is **blocked** in CI/promotion.
- [ ] Migration applies auto-reload the PostgREST schema cache.
- [ ] Post-deploy invoice smoke runs and can fail the deploy.
- [ ] Drift monitor alerts when an env is behind.
- [ ] `migrate-production` no longer does blind full replay.
