# Production remediation runbooks — index & execution order

> **Status: Priority #1 DONE — 2026-06-04.** Migration **`0118` was applied and
> validated; invoicing is RESTORED**. The remaining 43-migration drift was **NOT**
> applied and is still open (close later via staging). `0109` not applied; no AI
> enabled. This is the single entry point for the kako-fmcg drift remediation.
> Execution record: `EXECUTE-0118.md`.

## The situation in one line

The live DB (`kako-fmcg`, behind the Vercel `kako` app) is missing migrations
`0099`, `0100`, and `0103`–`0143`. The visible impact: **invoice creation is
broken** since `2026-06-01` (the app writes `erp_invoices.idempotency_key`, added
in `0118`, which the DB never applied).

## Documents in this package

| Doc | Use it for |
| --- | --- |
| **[`HOTFIX-INVOICING.md`](./HOTFIX-INVOICING.md)** | **Priority #1.** Restore invoicing now — minimum, verified package (`0118` + `0109`). Backup, rollback, validation, ~10 min, zero-behavior-change impact. |
| **[`MIGRATION-DRIFT-REMEDIATION.md`](./MIGRATION-DRIFT-REMEDIATION.md)** | The full drift picture + guarded plan to close all 43 missing migrations (after invoicing is stable). |
| [`../BACKUPS.md`](../BACKUPS.md) | Backup/restore tooling referenced by both (PITR + `scripts/backup.sh`). |

## Canonical execution order

1. **Backup** — confirm Supabase PITR is ON + take an on-demand `scripts/backup.sh`
   dump + record baseline counts. (HOTFIX §3.)
2. **Restore invoicing (Priority #1)** — apply **`0118`** explicitly; invoicing is
   back. Optionally apply `0109` per the approved bundle. (HOTFIX §4.)
3. **Validate** — run the HOTFIX §6 checklist (create a real invoice; idempotent
   retry; zero data loss).
4. **Stabilize** — confirm production is healthy before anything else.
5. **Full drift closure (later)** — only after a staging/PITR-copy dry-run and a
   `schema_migrations` tracking-convention decision. (DRIFT §6.)

## Hard rules (NO-GO)

- ❌ **Do not** run `supabase db push` against the live DB.
- ❌ **Do not** trigger the `migrate-production` GitHub workflow — it blindly
  replays all 143 files and halts mid-run on the already-applied, non-idempotent
  `0101`. (DRIFT §1.)
- ❌ **Do not** apply any migration other than the verified hotfix files without a
  staging dry-run.
- ✅ Apply only the **explicit, verified files**, each in its own transaction,
  after a backup.

## The one command that restores invoicing

> Operator runs this — not automated. After the §1 backup:

```bash
psql "$PRODUCTION_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -1 -f supabase/migrations/0118_payment_invoice_idempotency.sql
```

Then validate (HOTFIX §6). See `HOTFIX-INVOICING.md` for `0109`, rollback, and the
full checklist.

## Out of scope (future roadmap, not part of remediation)

- `docs/AI-STRATEGY.md` — Copilot AI enhancement plan. **Parked** until invoicing
  is restored and production is stable.
