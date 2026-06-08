# Formal Pre-Pilot Security Review — VANTORA / Kako

**Type:** Internal architecture-level security review (not an external penetration test —
see §9). **Scope:** the multi-tenant FMCG platform as it stands entering the controlled pilot,
including the Step 1 mobile/offline client and the Step 2 hardening work. **Verdict:**
**GO for controlled pilot**, with the residual items in §8 tracked and the external pen-test in
§9 scheduled before general availability.

> Methodology: review of the auth/RLS model, SECURITY DEFINER surface, server-action guards,
> the offline-intake pipeline, secrets handling, storage, and the CI-enforced invariants —
> grounded in the actual code/migrations, not assumed. Findings are severity-rated; residual
> risks are stated honestly rather than waved off.

## 1. Tenant isolation (multi-tenancy) — **Strong**

- Every tenant table enables RLS with the canonical predicate
  `erp_is_platform_owner() OR company_id = erp_user_company_id()` (USING + WITH CHECK).
- **CI-enforced invariants** (`schema-health.test.ts`): (a) every foreign key has a covering
  index (first index column = FK column); (b) **no RLS policy calls `auth.uid()` unwrapped** —
  all use `(select auth.uid())`, preventing per-row re-evaluation *and* the correctness foot-gun.
- Cross-tenant isolation is exercised by integration tests (`rls.test.ts`, `customer-scope.test.ts`).
- **Residual:** RLS correctness depends on every new table following the pattern; the schema-health
  gate catches the index/wrap issues but not a *missing* policy. Mitigation: the established
  additive-migration review + the immutable-table SELECT/INSERT-only convention.

## 2. Authentication & session — **Adequate**

- Supabase Auth; `middleware.ts` refreshes the session on every non-asset request
  (`updateSession`). The `(app)` layout calls `getUserContext()` and redirects unauthenticated
  users to `/login`; pages re-guard server-side (defense in depth — never client-only).
- **Residual:** session lifetime / MFA / password policy are Supabase-Auth-configured (ops),
  not in app code — confirm the project's auth settings before pilot (MFA for platform-owner/
  super-admin strongly recommended).

## 3. Authorization (RBAC) — **Strong**

- `getUserContext` resolves effective permissions as the union of the user's roles, **company-
  scoped** (`erp_company_role_permissions`, falling back to global `erp_role_permissions`).
  Super-admin → all; platform-owner/staff → vendor-scoped only (never tenant-operational).
- Pages gate with `hasPermission`; server actions guard with `requireAuth` /
  `requirePermission` / `requireAnyPermission` (used across ~40 action modules).
- **Temporary-access enforcement (Step 2, this cycle):** grant-only elevation, flag-gated
  `KAKO_TEMP_ACCESS_ENFORCEMENT` (default OFF), filtered to the active window + not-expired,
  company-isolated, audited. No deny rules, no RLS/visibility/approval changes. The other 0227
  governance primitives (data scope, approval authority, entity-360 sections) remain **dormant**
  pending a dedicated governance phase (explicitly out of scope here).
- **Residual:** authorization is enforced in the app layer (RLS handles *data* isolation, not
  *capability* gating). This is the platform's deliberate model; the main risk is a new route/
  action forgetting a guard — mitigated by the consistent 3-gate page pattern and action guards.

## 4. Database functions (SECURITY DEFINER) — **Strong**

- Privileged RPCs (check-in, payment, governance, retention/sweep, etc.) are `SECURITY DEFINER`
  with `SET search_path = public, pg_temp`, **self-guard on tenant scope** (`erp_user_company_id()`)
  and granular permission (`erp_user_has_perm`), and **`REVOKE EXECUTE … FROM anon, public`**
  (migrations 0070/0071 sweep this; new privileged functions follow suit, e.g. the Step 2
  retention/sweep functions are `service_role`-only).
- The offline-intake `erp_record_payment` is atomic + idempotent (idempotency-keyed, no-op on
  repeat, over-collection/cancelled/cross-branch rejected).

## 5. Offline / mobile pipeline (Step 1) — **Strong, server-authoritative**

- Exactly-once intake (`erp_offline_mutations (company_id, idempotency_key)` UNIQUE); the device
  **never finalizes ledgered state** — every apply replays the *same* RPC/action as the online
  path (no forked logic). Visits/collections are *Pending Validation* until the server validates.
- The intake routes are session-authenticated + `KAKO_MOBILE`-gated; media uploads are validated
  (type/size), private-bucket-stored, idempotent (`client_ref`), and gated by the new
  `field.attach_media` permission.
- **Residual:** a stolen device with a live session can enqueue mutations as that user — bounded
  by that user's permissions + RLS (no privilege escalation), and visible in the device-session
  audit. Standard mobile risk; mitigate with session expiry + remote sign-out (ops).

## 6. Secrets, internal endpoints & data protection — **Adequate**

- Internal maintenance/cron routes (`workflow-tick`, `sync-tick`, `audit-retention`,
  `access-expiry-sweep`, …) are `CRON_SECRET`-Bearer-guarded and use the service client only
  after the guard. The public API (`/api/v1/[entity]`) is **rate-limited**; integration
  connectors carry their own rate-limit handling.
- **Structured logging (Step 2, this cycle)** redacts sensitive keys
  (`authorization`/`token`/`api_key`/`password`/cookies/service+anon keys) recursively before
  emit; **alerting** is best-effort and never throws into the caller.
- Attachments live in a **private** Storage bucket with company-prefixed paths
  (`{company_id}/{entity}/{record_id}/…`), RLS on the metadata table, soft-delete, and
  short-lived **signed URLs** (no public object access).
- Audit log is append-only via `erp_log_audit`; **retention (Step 2)** is non-destructive by
  default (purge function refuses windows < 1 day and only runs when ops sets
  `AUDIT_RETENTION_DAYS`); daily `pg_dump` backups cover archival.
- **Residual:** confirm `CRON_SECRET`, `SERVICE_ROLE` key, and DB URLs are set as protected env
  secrets (never committed); rotate on staff changes. Verify Storage bucket RLS policies in the
  live project match the private-bucket assumption.

## 7. Supply chain / CI — **Adequate**

- CI gates every PR: Typecheck & build, **Integration tests (DB)** incl. schema-health, Playwright
  smoke, staging migration-apply; production migration-apply is **manual + guarded**.
- **Residual:** add automated dependency vulnerability scanning (e.g. `npm audit` / Dependabot)
  and secret-scanning to CI if not already enabled at the org level — recommended before GA.

## 8. Residual items (tracked, non-blocking for a controlled pilot)

| # | Item | Severity | Recommendation |
|---|---|---|---|
| 1 | MFA for platform-owner / super-admin | Medium | Enable in Supabase Auth before pilot |
| 2 | Dependency + secret scanning in CI | Medium | Add `npm audit`/Dependabot + secret scan |
| 3 | Storage bucket RLS verified in live project | Medium | Confirm private-bucket + path policies |
| 4 | Session expiry / remote sign-out for lost devices | Medium | Configure + document ops runbook |
| 5 | External **Principal Portal** (PIL-E) | High (when built) | Separate security review before building — already deferred |
| 6 | Dormant 0227 governance primitives (data scope / approval authority / entity-360) | Low | Review in the dedicated governance phase |
| 7 | Rate limiting on auth-app surfaces (beyond `/api/v1`) | Low | Consider edge/WAF rate limiting at GA |

No **Critical** or **High** findings block the controlled pilot. (#5 is High *only if/when* the
external portal is built — it is not in pilot scope.)

## 9. What a full external assessment adds (pre-GA)

This is an internal architecture review. Before general availability, schedule an **external
penetration test** covering: authenticated multi-tenant boundary testing (attempt cross-tenant
reads/writes via crafted requests), IDOR on `/api/v1` and internal routes, JWT/session handling,
storage signed-URL scoping, RLS bypass attempts, and the mobile-intake surface. Pair with an
automated SAST/dependency scan.

## 10. Conclusion

The platform's security architecture is **sound for a controlled pilot**: strong tenant isolation
(RLS + CI-enforced invariants + cross-tenant tests), a consistent RBAC + server-guard model, a
locked-down SECURITY DEFINER surface, a server-authoritative offline pipeline, private storage
with signed URLs, append-only audit with non-destructive retention, and (new this cycle)
redacting structured logs + alerting + grant-only temporary-access enforcement. The §8 residual
items are operational/configuration hardening, not architectural defects, and the §9 external
pen-test is the gate for GA — not for the pilot.

**Verdict: GO for controlled pilot.**
