# Rollback Runbook (app + database)

> Procedure only. Prepared `2026-06-04`. Covers: the merge-to-main code deploy,
> the applied `0118` hotfix, and (future) the drift closure. Choose the lightest
> mechanism that covers the failure.

## Decision tree
1. **App regression only (no schema cause)?** → roll back the app deploy (§A).
2. **A migration caused it?** → reverse that migration (§B) or restore (§C).
3. **Unknown / data integrity at risk?** → restore (§C).

## §A — Application rollback (Vercel)
- Vercel → project `kako` → Deployments → select the previous **READY**
  production deployment → **Promote/Redeploy**.
- Confirm the rolled-back build is serving; run the smoke checklist.
- Time: ~2–5 min. No DB impact.

## §B — Targeted migration reverse
**`0118` (applied) — additive, reversible, no data loss:**
```sql
DROP INDEX IF EXISTS uq_erp_payments_idem;
DROP INDEX IF EXISTS uq_erp_invoices_idem;
ALTER TABLE erp_payments DROP COLUMN IF EXISTS idempotency_key;
ALTER TABLE erp_invoices DROP COLUMN IF EXISTS idempotency_key;
-- restore the 5-arg erp_record_payment body from migration 0007 if fully reverting
DELETE FROM supabase_migrations.schema_migrations WHERE name='0118_payment_invoice_idempotency';
NOTIFY pgrst, 'reload schema';
```
> ⚠️ Reverting `0118` re-breaks invoicing — only if the apply itself failed.
> `0118` is healthy in production today; no reverse is expected.

**Drift closure (future):** prefer PITR (§C) over hand-reversing 42 migrations.

## §C — Restore from backup
- **PITR** (once enabled): restore to a timestamp just before the change —
  consistent schema + data. Preferred for multi-object changes.
- **Physical backup** (available now, latest ~`07:39 UTC` snapshots): restore the
  most recent good snapshot. ⚠️ Without PITR, data written after the snapshot is
  lost — acceptable only as a catastrophic fallback.
- **Portable dump:** `scripts/restore.sh --yes <dump>` into the target after
  taking a fresh dump of the current (broken) state. See `docs/BACKUPS.md`.

## After any rollback
- [ ] Run the smoke + post-deploy validation checklist.
- [ ] Confirm advisors clean; counts sane.
- [ ] Record incident notes: trigger, mechanism, time-to-recover, data delta.
- [ ] Update the Release Package status + Risk Register.

## Hard rules
- Never `db push` / `migrate-production` to "fix forward" blindly.
- Always take/confirm a backup before a corrective schema change.
