# PITR Enablement Plan

> Planning only — no production change. Prepared `2026-06-04`. Project:
> `nrvydmkxjnctdlaxdhur` (kako-fmcg). Current state: scheduled **physical
> backups ON** (latest verified `04 Jun 2026 07:39 UTC`, restorable); **PITR
> NOT enabled**. Goal: enable Point-in-Time Recovery before the residual drift
> closure (and as a permanent resilience baseline).

## Why
- Physical daily backups give coarse recovery (to the last snapshot). Any change
  between snapshots is unrecoverable on a full restore.
- The residual drift closure (42 migrations) is a larger, multi-object change;
  PITR gives second-level recovery and is the runbooks' designated primary
  rollback. It should be ON before that work.

## Prerequisites
- Supabase **paid plan** tier that includes PITR (verify current plan).
- Owner/admin access to the Supabase project dashboard.
- A low-traffic window (enabling PITR is non-disruptive but plan changes should be deliberate).

## Steps (operator, dashboard)
1. Supabase → Project Settings → **Database → Point in Time Recovery**.
2. Confirm the plan supports PITR; upgrade tier if required (cost review first).
3. **Enable PITR**; choose retention (recommend ≥ 7 days).
4. Wait for the first WAL baseline to establish; confirm the dashboard shows a
   PITR window with an advancing "earliest recoverable" timestamp.
5. Record the PITR window in the ops log.

## Validation (recommended, in STAGING — never destructive on prod)
- Perform a **PITR restore drill** into a throwaway/staging project: restore to a
  timestamp ~5 min in the past, verify schema + a few tenant rows, record
  time-to-recover. (Pairs with the `docs/BACKUPS.md` restore drill.)

## Acceptance
- [ ] PITR shows ON with a populated recovery window.
- [ ] Retention ≥ 7 days (or agreed value).
- [ ] One successful restore drill into staging, time-to-recover recorded.
- [ ] Ops log + Day-1 checklist updated to "PITR: ON".

## Cost / decision note
PITR may require a plan upgrade — **a business decision**. If deferred, the
physical-backup + targeted-reverse strategy remains the interim rollback, and the
**drift closure must wait** until PITR is enabled.
