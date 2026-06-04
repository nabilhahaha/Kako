# Drift Closure Plan — remaining 42 migrations

> Plan only — **do NOT execute now.** Prepared `2026-06-04`. Detailed mechanics:
> `runbooks/MIGRATION-DRIFT-REMEDIATION.md`. This is the executive plan.

## Scope
Production (`kako-fmcg`) is applied through `0098` + `0101`/`0102` + **`0118`
(hotfix)**. Remaining unapplied: **`0099`, `0100`, `0103`–`0117`, `0119`–`0143`
= 42 migrations** (the original 43 minus the now-applied `0118`).

## Hard prerequisites (all must be true before starting)
1. **PITR enabled** (see `PITR-ENABLEMENT.md`) — primary rollback for a
   multi-object change.
2. **Staging available** with a **production-equivalent restore** (see
   `STAGING-DESIGN.md`).
3. **`schema_migrations` tracking convention decided** (numeric vs timestamp) —
   the reconciliation prerequisite.
4. A **maintenance window** agreed (RLS/authz cutover in `0104/0105/0107/0108`
   changes visibility the moment it applies).

## Sequence
1. **Staging dry-run:** restore prod copy → apply the 42 files **explicitly, in
   order, excluding already-applied `0101`/`0102`/`0118`** → run `test:db` +
   smoke + UAT → fix any surprise there.
2. **Backup/PITR confirm** on production (pre-flight gate).
3. **Production apply** in the window: explicit, ordered, fail-fast; record each
   in `schema_migrations` per the chosen convention; reload schema cache.
4. **Validate:** `supabase db push` (or the chosen tracker) reports **zero
   pending**; advisors clean; sentinel objects present (`trial_ends_at`,
   `approval_status`, `journey_plans`, `product_uoms`, etc.); RLS/authz smoke.
5. **Stabilise + monitor.**

## Hard NO-GO (unchanged)
- ❌ `supabase db push` / `migrate-production` blind replay against the live DB.
- ❌ Applying without a staging dry-run.
- ❌ Closing this now (it is explicitly deferred until prerequisites are met).

## Risk callout
The merged `main` may include `1c2d8dc` (visit_reasons / raw_data_mappings schema
refactor). Ensure the residual-drift set and that refactor are reconciled (no
duplicate/conflicting objects) **in staging** before any production apply.

## Acceptance
- [ ] Staging dry-run green on a prod-equivalent copy.
- [ ] Convention decided; reconciliation script verified.
- [ ] Production apply → zero pending; advisors clean; RLS smoke passed.
- [ ] No data loss; counts sane.
