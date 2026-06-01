# VANTORA — Production Rollout Plan (migrations 0099–0113)

*Planning document. Production is at `0098`; everything from `0099`–`0113` is staging-only. Nothing is applied to production without explicit approval.*

## Scope (apply in strict order)
| # | Migration | What it does | Notes |
|---|---|---|---|
| 0099 | company_trial | `erp_companies.trial_ends_at` | additive column |
| 0100 | subscription_canonical | projection trigger + backfill + RPCs | **backfills ~1 sub/company; no-op projection** |
| 0101 | workflow_engine_extensions | scope/versioning/delegation/events + audit triggers | redefined again by 0108 |
| 0102 | workflow_platform_scope | platform approvers, scope-aware RLS | redefines make_tasks/start |
| 0103 | workflow_hierarchical_approvers | manager/department_head | redefines make_tasks |
| 0104 | subscription_change_requests | typed table + platform workflow | |
| 0105 | onboarding_requests | typed table + platform workflow | |
| 0106 | module_activation_requests | typed table + platform workflow | |
| 0107 | workflow_route_ownership | account/route owner + subject anchor | redefines make_tasks/start |
| 0108 | audit_trail_engine | before/after capture + workflow-linked audit | redefines 0101 triggers |
| 0109 | permission_matrix | catalog + grants + resolver | |
| 0110 | notification_engine | templates/preferences/dispatch | redefines erp_notify (additive) |
| 0111 | raw_data_framework | erp_raw_facts + emitter | |
| 0112 | customer_360 | composing function | superseded by 0113 |
| 0113 | raw_facts_currency_region_area | currency/source + region/area + emitter/360 | |

**Ordering is mandatory** — several migrations `CREATE OR REPLACE` the same functions (workflow `make_tasks`/`start`: 0102→0103→0107; workflow audit triggers: 0101→0108; emitter/Customer-360: 0111/0112→0113). The migration runner applies in filename order, which is correct.

## Rollout risks
1. **Canonical subscription cutover (0100)** — backfills one `erp_billing_subscriptions` per company (production has ~40 companies, 0 billing subs today) and the projection writes the company cache. Designed as a **no-op** (no company has `trial_ends_at`), but must be proven on production-shaped data.
2. **Audit capture (0108) + emitter** begin firing immediately on apply — avoid running bulk operations during/right after the window.
3. **No prior production dry-run**; staging ≠ production data shape/volume.
4. **Function-redefinition ordering** (covered above).
5. **RLS widening** (audit company-admin read; matrix; workflow scope) — verify no unintended exposure (integration RLS tests cover this).

## Recommended cutover sequence
1. **Backup / PITR checkpoint** of production immediately before.
2. **Dry-run on a production clone:** restore prod → apply `0099`–`0113` in order → verify:
   - subscription **no-op**: for every company, `(plan_key, subscription_end, is_active)` unchanged vs a pre-snapshot (empty diff);
   - workflow definitions seeded (subscription_change / onboarding / module_request);
   - permission catalog + matrix defaults present;
   - no errors; `erp_customer_360(<known customer>)` returns.
3. **Apply to production** via the guarded migration job, **in order, one transaction per migration**, in a low-traffic window.
4. **Post-apply smoke test:**
   - subscription state badge unchanged for a sample of tenants;
   - start + decide a throwaway workflow (or inspect an existing one) → event + audit row appear;
   - update a test customer field → audit before/after row;
   - `erp_matrix_has` returns expected for a sample role;
   - `erp_customer_360` returns for a known customer.
5. **Monitor** audit/dispatch table growth and query latency for 24–48h.

## Rollback
Each migration ships documented, additive, reversible steps (drop triggers/functions; restore prior bodies; added columns/rows are harmless). The `erp_companies` subscription **cache stays authoritative throughout**, so access control is never at risk during or after rollback. Prefer forward-fix for additive columns; use the per-migration rollback blocks for functions/triggers if needed.

## Pre-conditions (close before cutover)
- ✅ P0.1 currency / source on raw facts (0113).
- ✅ P0.2 Region/Area model (0113).
- ✅ P0.4 integration + RLS tests (run green in CI with a test DB).
- ☐ Backup + production-clone dry-run executed.
- ☐ Decision on notification email (P1) — not required for cutover (in-app unchanged).

*Execution is gated on explicit approval and a backup + dry-run. This document is the plan, not an apply.*
