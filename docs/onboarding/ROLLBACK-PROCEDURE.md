# VANTORA — Go-Live Rollback Procedure

**Env:** `vantora-staging` → production (`rsjvgehvastmawzwnqcs`). **`kako-fmcg` is never involved.**
Covers how to revert each go-live phase. **The only irreversible-without-a-restore-point step is the
demo cleanup (Phase 1) — which is why PITR is a hard gate.**

---

## Rollback by phase

| Phase | If it goes wrong | Rollback |
|---|---|---|
| **0. Backups** | n/a (no mutation) | nothing to undo |
| **1. Demo cleanup** | wrong/over-deletion | **PITR restore** to the recorded pre-cleanup timestamp (primary). Fallbacks: restore latest daily backup; or re-run `reference-company.sql` to rebuild the demo tenant from scratch. The script also **self-rolls-back** on any verification failure (one transaction). |
| **2. Master-data import** | bad/duplicate rows | Importer is idempotent on `external_id`/`code` — fix the CSV and re-import with `upsert`; or delete the affected company and re-run from clean. Each row is stamped with `import_job_id` for targeted cleanup. |
| **3. Users & roles** | wrong role/assignment | Re-assign role in `erp_user_branches` (no destructive change); deactivate a mis-created user; corrections are reversible data edits, not deletions. |
| **4. Public frontend** | wrong target / exposure | Revert Vercel env vars / re-enable Deployment Protection / roll back to the previous deployment (Vercel keeps immutable deployments — instant rollback). No DB impact. |
| **5. Hardening** | toggle regressions | Each setting (leaked-password, advisors fixes) is individually reversible in the dashboard. |

## Primary rollback — PITR restore (Phase 1)

1. Dashboard → `vantora-staging` → **Database → Backups → Restore**.
2. Choose **Point-in-Time** and enter the **recorded pre-cleanup UTC timestamp** (Checklist Phase 0).
3. Restore (Supabase provisions the recovered state). Confirm: `erp_companies`=1, `auth.users`=58,
   270 `erp_*` tables, FMCG RPCs present.
4. Re-run the schema-integrity + refined-role assertions to confirm parity.

> If only daily backups exist (no PITR), restore the **latest snapshot taken before cleanup** — same steps,
> coarser granularity.

## Secondary rollback — rebuild from seed (backup-independent)

If no restore point is usable, the demo tenant is fully reproducible:
```
psql "$DATABASE_URL" -f supabase/pilot/reference-company.sql
psql "$DATABASE_URL" -f supabase/pilot/reference-activity-and-validate.sql   # optional: activity + 325 assertions
```
This recreates the company, 19 users + owner, refined roles, master data, and (optionally) the validated
transaction loop. It does **not** restore real distributor data — use PITR for that.

## Built-in safety of the cleanup script

`supabase/pilot/golive-demo-cleanup.sql`:
- **Refuses to run** unless exactly 1 (demo) company and 0 non-`@nile-group.test` users exist — so it can
  never delete real data that has already been imported.
- **Dry-run by default**: without `vantora.cleanup_confirm='APPLY'` it executes the deletes, verifies, then
  **raises → rolls back** (zero changes), printing what would remain.
- Runs in **one transaction** with post-delete verification; any anomaly aborts the whole operation.

## Escalation

If a restore appears incomplete: do **not** re-run cleanup or imports. Capture the current counts, keep the
environment as-is, and restore a known-good earlier point. `kako-fmcg` remains the untouched, independent
fallback environment throughout.
