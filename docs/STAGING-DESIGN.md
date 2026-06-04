# Staging Environment Design

> Design only — no provisioning performed. Prepared `2026-06-04`. Purpose: a
> production-like environment to **dry-run migrations** (esp. the residual 42)
> and to **evaluate AI V1** before anything reaches production.

## Goals
1. Prove migrations apply cleanly **on top of production-equivalent state** (not
   just a fresh DB — CI already covers fresh).
2. Run `test:db` + smoke + UAT against a real deployment.
3. Host the flag-ON AI evaluation safely (no production exposure).

## Topology
- **Staging Supabase project** (separate from `kako-fmcg`), OR a **Supabase
  preview branch** of production for short-lived dry-runs.
  - *Preview branch*: fastest, clones prod schema; good for migration dry-runs.
  - *Standalone staging project*: longer-lived; good for UAT + AI eval.
- **Staging Vercel environment** wired to the staging Supabase URL/keys via env
  vars (mirrors prod config; never points at `kako-fmcg`).
- Secrets: `STAGING_DATABASE_URL` (already referenced by `migrate-staging.yml`).

## Seeding production-equivalent state
- Option A (preferred for drift dry-run): **restore the latest physical backup
  (or PITR copy) of production into staging** → staging now mirrors prod's
  applied-through-`0118` state → apply the 42 pending migrations there.
- Option B: anonymized subset for UAT/AI eval (no real PII to the AI provider).

## Workflows
- `migrate-staging.yml` already auto-applies on push to `claude/**` when
  `STAGING_DATABASE_URL` is set — use for the dry-run, against a **reset** staging.
- Add a staging deploy of the release commit; run smoke + UAT (see
  `OPERATIONS-CHECKLISTS.md`).

## AI evaluation use (later)
- Set `COPILOT_AI_ENABLED=true` **in staging only**; register a free-tier LLM
  provider; measure AR/EN intent accuracy via `erp_copilot_queries`. Deterministic
  fallback guarantees "never worse". Never enable in production from here.

## Acceptance
- [ ] Staging Supabase + Vercel reachable, isolated from prod.
- [ ] Production-equivalent restore validated (schema parity).
- [ ] `migrate-staging` applies the 42 pending migrations cleanly on the restored copy.
- [ ] `test:db` + smoke + UAT green in staging.
- [ ] Documented teardown/refresh procedure (so staging stays representative).

## Guardrails
- Staging env vars NEVER point at `kako-fmcg`.
- No real PII sent to any external AI provider during eval (anonymize or synthetic).
