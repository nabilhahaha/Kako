# Production Migration Readiness (PR-4)

How to take the current branch (`0001 → 0153`) to a production Supabase project
safely. The full chain is proven to apply **idempotently on a fresh database**
by CI on every run (`supabase/ci/setup-test-db.sh` → 432 integration tests).

## 1. Idempotency guarantee
- Every migration uses `create … if not exists`, `add column if not exists`,
  `create or replace function`, `drop policy if exists` + `create policy`, and
  guarded `do $$ … $$` blocks (e.g. storage limits, `pg_cron` wiring).
- CI rebuilds the schema from zero each run, so "applies cleanly start-to-finish"
  is continuously verified. A re-run of any single migration is safe.
- Each migration ends with a `ROLLBACK (manual)` comment describing the inverse.

## 2. Pre-cutover (on a PROD CLONE first)
1. **Clone** the target production DB (or a representative dataset) into a
   throwaway Supabase branch.
2. `TEST_DATABASE_URL=<clone> bash supabase/ci/setup-test-db.sh` is for an empty
   DB; for an **existing** prod DB run only the *new* migrations in order
   (`supabase db push`, or apply `0125…0153` sequentially) — they are additive.
3. Run `npx vitest run` against the clone (set `TEST_DATABASE_URL`) → expect all
   green.
4. Verify no destructive change: this branch adds tables/columns/functions/
   indexes only — **no `drop table`, no column drops** on existing data.

## 3. Cutover (production)
1. Take a **backup / PITR checkpoint** (Supabase keeps automatic backups; note the
   restore point).
2. Apply migrations `0125 → 0153` in order (CI-proven). Expected new objects:
   field-execution (visits/captures/scoring/alerts/digests), commercial
   (facts/targets/performance/commission/incentive), TPM, governance, scheduler,
   ERP-sync ingestion, plus indexes (0151) — all additive.
3. **Post-cutover steps that need real Supabase** (no-ops on the test stub):
   - **Storage** (0151): confirm `field-evidence`/`visit-photos`/`near-expiry-photos`
     buckets now have a 10 MB limit + image-only mime allow-list.
   - **pg_cron / pg_net** (0152): ensure the `pg_cron` extension is enabled; the
     guarded block schedules `erp-sched-tick` (15 m) and `erp-sched-stale` (30 m).
     If `pg_cron` runs in a different DB, point the schedule at this DB or call
     `erp_sched_tick()` from an Edge Function cron.
   - Run `erp_sched_ensure_defaults()` per pilot company (or via the Scheduler UI).
4. Smoke test: log in as a company admin → Field dashboard, Commercial dashboard,
   Governance, Scheduler, Sync dashboard all load; run one alert detection +
   one commission run.

## 4. Rollback
- **Schema:** restore from the pre-cutover backup / PITR point (fastest, clean).
- **Per-feature:** each migration's `ROLLBACK (manual)` block lists the drops to
  reverse just that migration if a targeted revert is preferred.
- **Config (no schema):** anything published via **Configuration Governance**
  (`/governance`) can be rolled back per-change without a DB rollback.

## 5. Readiness checklist
- [ ] Clone dry-run applied `0125→0153` with zero errors
- [ ] `vitest` green against the clone
- [ ] Backup/PITR point recorded before prod apply
- [ ] `pg_cron` enabled + tick/stale scheduled (or Edge cron configured)
- [ ] Storage limits confirmed on photo buckets
- [ ] `erp_sched_ensure_defaults()` run for pilot company
- [ ] Admin smoke test passed
