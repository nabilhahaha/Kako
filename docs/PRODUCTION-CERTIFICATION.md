# VANTORA — Production Certification & Governance Program Close-Out

**Project:** `nrvydmkxjnctdlaxdhur` (kako-fmcg, production)
**Certified:** 2026-06-05
**Decision:** Defer outstanding migrations — certify production as-is. No FMCG production deployment at this stage.
**Status:** 🟢 CERTIFIED READY — governance program **CLOSED**.

---

## 1. Decision summary

Production is certified on its **current stable schema**. No additional migrations were
applied. The outstanding migration backlog is **deferred** (documented below) and held for a
future, separately-approved, backup-protected release. Forward work proceeds on **Fashion
Store and POS enhancements only**.

This decision was taken because production **cannot accept the outstanding migrations in
isolation**:

- The guarded production migration job applies **all** `supabase/migrations/*.sql`
  (`0001→0160`) via `psql -v ON_ERROR_STOP=1` with **no migration tracking**. The migrations
  are explicitly non-idempotent (designed for a *fresh* database). Production is **populated**
  (44 companies, 129 tables) with the `0005` baseline already applied, so the job would collide
  on the first `CREATE TABLE`/`CREATE TYPE` and halt — after potentially autocommitting
  partial, irreversible statements. It is a fresh-DB bootstrap tool, **not** a safe incremental
  apply for this database.
- The two outstanding governance migrations **`0159` and `0160` physically cannot apply**:
  `0160` targets `erp_copilot_queries` (absent in prod) and **19 of `0159`'s 22 target tables
  do not exist in prod** (`erp_journey_plans`, `erp_msl_policies`, `erp_van_reconciliations`,
  …). They depend on the unreleased FMCG backlog (`0103–0145`).
- Therefore "apply the documented sequence in order" would necessarily deploy the **entire
  unreleased FMCG backlog** to production — out of scope for this program.

---

## 2. Validation results (read-only, production)

All five checks **PASS** on the current production schema.

| Check | Result | Status |
|---|---|---|
| **Advisors — Security** | 0 ERROR · 107 WARN | ✅ No critical/high vulns |
| **Advisors — Performance** | 0 ERROR · 150 WARN · 216 INFO | ✅ Benign / by-design |
| **Schema health** | 0 unindexed FKs · 0 truly-bare `auth.uid()` | ✅ |
| **FK coverage** | Every FK has a covering index | ✅ |
| **RLS** | 129 / 129 `erp_` tables RLS-enabled · 0 disabled · 0 RLS-on-without-policy | ✅ |
| **Audit** | `erp_audit_logs` present, RLS-on · 231 rows · 8 audit triggers · 16 companies | ✅ |

**Security WARN breakdown:** 80 `authenticated`-executable SECURITY DEFINER functions
(by-design RPC pattern; functions enforce authorization internally), 23 `anon`-executable
SECURITY DEFINER functions (low-risk hardening item), 2 mutable `search_path`, 1 `pg_net`
extension in `public`, 1 leaked-password-protection disabled (Auth dashboard config).

**Performance WARN/INFO breakdown:** 150 `multiple_permissive_policies` (platform-owner +
tenant dual-policy trade-off), 215 `unused_index` (expected on a young/low-traffic DB),
1 connection advisory.

> Note: an initial schema-health pass flagged 21 "bare `auth.uid()`" policies. On inspection
> these were a **regex artifact** — every policy is correctly init-plan-wrapped as
> `(SELECT auth.uid())` (Postgres pretty-prints the wrapped form as `( SELECT auth.uid() AS uid)`,
> which the first strip pattern did not account for). Corrected check: **0 truly-bare**.

---

## 3. Deferred migration register

The following **45** repo migrations are present in the codebase but **not applied to
production**, and are intentionally **deferred**. They must be released later via tracked,
per-migration apply within a PITR/backup window — **not** via the fresh-DB for-loop job — and
require explicit, separate approval.

| Group | Migrations | Nature |
|---|---|---|
| Early additions | `0001`–`0004` | visit reasons/buckets, promotions, audit logs, trade spend |
| FMCG customer & RLS scope | `0103`–`0117` | customer model, hierarchy/txn-scope RLS, pricing engine, pilot hardening, attachments, field governance |
| FMCG governance & limits | `0119`, `0121`–`0125` | retention cleanup, per-assignment scope, role limits/routing, field-section binding, finer capabilities, admin role-perms |
| FMCG operations backbone | `0128`–`0145` | MSL master, journey plans, transfers, GPS compliance, day-close, van transfers/reconciliation, copilot, UoM pricing, targets, returns, retail execution, outlet grading |
| Governance/CI hardening (FMCG-dependent) | `0159`, `0160` | remaining FK indexes + copilot init-plan policy — **depend on the FMCG backlog above** |

These represent **unreleased features**, not a broken production state.

---

## 4. Governance program — delivered & live in production

The Platform Owner Control Center governance program is **complete and closed**. Live and
validated in production (`0149`–`0158`):

- Platform-owner profile/global-role RLS isolation (`0149`, `0152`)
- Supplier-payments RLS scoping (`0151`)
- Tenant audit read access (`0153`)
- Integrations module backfill + clothing fashion-only template (`0154`, `0155`)
- POS plan capability (`0156`)
- FK-coverage indexing + RLS init-plan `auth.uid()` wrapping (`0157`, `0158`)

---

## 5. Open hardening items (non-blocking, future)

1. **Schema-lineage divergence** — production runs a squashed/selectively-patched lineage; the
   repo carries the full FMCG development lineage. Reconcile as part of the planned FMCG release.
2. **23 `anon`-executable SECURITY DEFINER functions** — candidate for a `REVOKE EXECUTE FROM
   anon` follow-up (functions already enforce auth internally).
3. **Leaked-password protection disabled** — one-click enable in Supabase Auth settings.

---

**Certification:** Production is stable, fully RLS-isolated, FK-indexed, audit-instrumented,
and free of critical security or performance findings. Certified ready on the current schema.
Governance program **CLOSED**.
