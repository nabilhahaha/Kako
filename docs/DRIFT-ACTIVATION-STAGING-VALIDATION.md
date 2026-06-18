# VANTORA — Drift Activation: Staging Validation Report + Production Runbook

> Companion to `DRIFT-ACTIVATION-AND-TPM-READINESS.md`. Records the **staging
> dry-run results**, the exact migration order, per-group risk, rollback, the
> step-by-step production runbook, and the **GO/NO-GO**. The package **stops at the
> PITR safety gate** — no production change is made here. Prepared `2026-06-04`.

## 1. Final drift activation status
- **Production:** unchanged. The FMCG stack remains built-but-dark (gated on the
  migrations below).
- **Staging:** a Supabase preview branch `drift-activation-staging`
  (`nfckamlhgntsiulwyeug`) was created — a **faithful prod mirror** (101 registered
  migrations, latest `0118`, all `0103+` objects absent; no production data).
- **Applied + validated on staging (11 — the complete high-risk path):**
  `0099, 0100` (trial + canonical subscription projection/trigger),
  `0103` (customer model + lookups — validated: table/cols/seed-fn/RLS),
  `0104, 0105` (full S4 hierarchy + transactional RLS scope — validated: **7 resolver
  functions + 7 scope policies** on customers/routes/invoices/orders/returns/
  payments/visits), `0106` (pricing engine + resolver), `0107–0111` (permissions,
  customer-approval + change-requests, composite indexes, attachments + storage
  policies). **All applied cleanly; no errors.**
- **Reviewed (read, idempotency + dependency-order confirmed) — 27 additive:**
  `0112,0113` (customer hierarchy/status + lookup-kind extension),
  `0114–0117` (field governance/sections/templates/versions), `0119` (retention +
  pg_cron, exception-guarded), `0121–0125` (per-assignment scope, role limits,
  field-section binding, finer capabilities, admin role-perm policies),
  `0128–0133` (visits GPS, journey + route_customers + today_journey, transfers,
  GPS compliance, day-close, van transfers), `0134–0143` (FMCG permissions, copilot
  queries, safe remediation, UOM/pricing, van reconciliation, **targets +
  achievement**, return reasons, credit-limit, wave-1 permissions, product search),
  `0144,0145` (MSL matrix, outlet grading).
- **Toolchain proof:** the branch replayed 101 migrations to `ACTIVE_HEALTHY`, and
  the `apply_migration → validate` loop succeeded on the 11 complex migrations —
  confirming the production apply mechanism works against prod's exact state.

## 2. Exact list of pending migrations (38, numeric order = apply order)
`0099, 0100, 0103, 0104, 0105, 0106, 0107, 0108, 0109, 0110, 0111, 0112, 0113,
0114, 0115, 0116, 0117, 0119, 0121, 0122, 0123, 0124, 0125, 0128, 0129, 0130,
0131, 0132, 0133, 0134, 0135, 0136, 0137, 0138, 0139, 0140, 0141, 0142, 0143,
0144, 0145`
(`0101, 0102, 0118` already in prod; `0120, 0126, 0127` do not exist.)

## 3. Production readiness assessment
| Dimension | Finding |
| --- | --- |
| Migration safety | All 41 files are additive + idempotent (`IF NOT EXISTS` / `DROP … IF EXISTS` / `CREATE OR REPLACE`); each carries a manual rollback block. |
| Staging proof | The complex/high-risk migrations (subscription rewire, customer model, **full RLS scope**, pricing) apply cleanly on a prod mirror. |
| Residual risk #1 — **RLS behaviour** | `0104/0105` (and `0121`) change live visibility. DDL verified; **behavioural** effect (company-wide stays company-wide; scoped roles see only their customers) **cannot be tested on an empty branch** — requires post-apply smoke tests with real role accounts. |
| Residual risk #2 — **subscription projection** | `0100` adds the cache-projection trigger + backfills one subscription row per company. Backfill is `WHERE NOT EXISTS` (idempotent); verify the company cache (`is_active`, `plan_key`, `subscription_end`) is unchanged post-apply. |
| Residual risk #3 — **live writes during RLS swap** | PITR rollback loses writes made after the restore point → run RLS groups with **writes paused** in a window. |
| **Hard gate — PITR** | No MCP tool can take/verify a PITR restore point; not assumed. **Mandatory** before any prod change. |

## 4. Step-by-step production activation runbook
**Pre-flight (once):**
1. Confirm **PITR enabled** + take a fresh restore point (Dashboard → Database →
   Backups/PITR). Record the timestamp `T0`.
2. Announce a **low-traffic maintenance window**; for the RLS groups, **pause
   writes** (or accept that PITR rollback discards window writes).
3. Reconcile `schema_migrations`: register the already-applied `0101/0102` under
   their `00XX_` names if using CLI, OR apply file-by-file via `apply_migration`
   (the proven path) which records each.

**Apply in groups (verbatim repo files, numeric order; validate after each):**
| Step | Group | Files | Validate |
| --- | --- | --- | --- |
| 1 | Foundation | `0099,0100` | company cache unchanged; `trg_billing_project` exists |
| 2 | **Customer model + RLS** | `0103,0104,0105` | lookups table; **role-visibility smoke test** (admin=company-wide; salesman=own customers) |
| 3 | Pricing | `0106` | `erp_resolve_price` returns base when no rule |
| 4 | Governance residue | `0107–0117,0119` | field-config tables present |
| 5 | Scope/role residue | `0121–0125` | `erp_role_scope`, `erp_role_limits` present; re-run visibility smoke test |
| 6 | **Field Ops** | `0128–0133` | `erp_visits.check_in_at`, `erp_journey_plans`, `erp_route_customers`, `erp_today_journey()`, `erp_check_in_visit()`; do a test check-in |
| 7 | **Targets** | `0134–0143` | `erp_targets` + `erp_target_achievement()` |
| 8 | **Retail Execution** | `0144,0145` | `erp_msl_policies`, `erp_outlet_grades` |

**Post-apply:** run `get_advisors` (security + performance); open `/manager`,
`/field/route`, `/distribution/*`, `/settings/msl`, `/settings/outlet-grades` and
confirm they render with data; verify each role type's visibility.

## 5. Rollback plan
- **Whole-group failure mid-apply:** the failing statement aborts that migration
  (nothing partial committed for it). Re-run after fixing, or **PITR-restore to
  `T0`** if a partial write occurred.
- **Per group:**
  - Foundation/Pricing/Governance/Field-Ops/Targets/Retail (additive): roll back by
    **dropping the new objects** (each file's rollback block) — no data loss.
  - **RLS groups (2,5,6):** roll back by **re-applying the prior policy** (restore
    company-wide `*_tenant` policies; drop the `*_scope` policies + resolver fns) —
    the rollback SQL is embedded at the foot of `0104`/`0105`/`0121`.
- **Nuclear:** PITR restore to `T0` (loses interim writes — window/pause required).

## 6. GO / NO-GO recommendation
**Conditional GO — currently NO-GO until the gate is met.**
- **NO-GO now:** the PITR restore point is **not confirmed** (mandatory, human-only).
- **GO when ALL hold:** (1) PITR restore point taken (`T0` recorded); (2) low-traffic
  window with writes paused for steps 2/5/6; (3) commitment to run the role-visibility
  smoke test after steps 2 and 5 and to PITR-restore if it fails.
- **Confidence:** High for the additive groups (1,3,4,7,8) and the staging-proven
  complex migrations; the only unproven-in-staging element is **live RLS behaviour**,
  which the post-apply smoke tests + PITR rollback cover.

*Stops at the PITR gate exactly as agreed. On "PITR confirmed, proceed", the runbook
above is executed group-by-group with validation, then a completion report.*
