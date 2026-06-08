# Step 2 — Pre-Pilot Hardening: Readiness Checkpoint

**Status:** ✅ **Complete.** All seven approved hardening items delivered, additive, CI-green,
flag-gated/non-destructive where they touch sensitive surfaces. **Verdict: ready for controlled
pilot** (carrying the operational residual items from the Formal Security Review §8).

## The seven items

| # | Item | PR | Outcome |
|---|---|---|---|
| 1 | **Sync Retry** | #241 | Offline queue: bounded exponential backoff (2s→5m), dead-letter after cap, surfaced in the status bar. Network drops aren't retry-consuming. |
| 2 | **Audit Log Retention** | #242 | `erp_purge_audit_logs` (service-role only, refuses windows < 1 day) + `/api/internal/audit-retention`. **Non-destructive by default** — no-op until `AUDIT_RETENTION_DAYS` is set. |
| 3 | **Temporary Access Expiry Sweep** | #243 | `erp_temporary_access_grants.expired_at` + `erp_sweep_expired_access()` (stamps, never deletes; idempotent; one aggregate audit) + `/api/internal/access-expiry-sweep`. |
| 4 | **Structured Logging** | #244 | `observability/log` — JSON-line logger, `LOG_LEVEL`-filtered, recursive secret redaction. Pure formatter unit-tested. |
| 5 | **Alerting** | #244 | `observability/alert` — always logs; POSTs to `ALERT_WEBHOOK_URL` when set (best-effort, never throws). Wired into the cron routes (critical alert on failure). |
| 6 | **Governance Enforcement Wiring** | #245 | **Temp-access grants only** (per approved scope): grant-only union into `getUserContext`, filtered to `effective_from ≤ now ≤ effective_to AND expired_at IS NULL`, company-isolated, audited. **Flag-gated `KAKO_TEMP_ACCESS_ENFORCEMENT` (default OFF).** Other 0227 primitives stay dormant. |
| 7 | **Formal Security Review** | (this PR) | `docs/assessments/FORMAL_SECURITY_REVIEW.md` — internal architecture-level review. **GO for controlled pilot**; external pen-test scheduled pre-GA. |

## Safety posture

- **Nothing destructive ships enabled:** audit purge is opt-in via env + refuses sub-day windows;
  the expiry sweep stamps (never deletes); temp-access enforcement is flag-gated OFF.
- **No RLS / row-visibility / approval-engine changes** were made (honored the approved scope).
- **Reuse-first:** retry builds on the Step 1 engine; enforcement reuses the role-governance pure
  functions; alerting reuses the new logger; routes reuse the existing `CRON_SECRET` + service-client pattern.
- **Migrations 0236 (audit retention) + 0237 (expiry sweep)** are additive and apply clean from scratch.

## Validation

`tsc` 0 · `next build` 0 · offline-sync 13 unit · observability 3 unit · role-governance 9 unit ·
integration **94** (incl. new audit-retention, expiry-sweep, temp-access-enforcement tests) · all
six CI checks green on every PR (#241–#245).

## Operational residuals (from Formal Security Review §8 — tracked, non-blocking)

MFA for platform-owner/super-admin · dependency + secret scanning in CI · verify live Storage
bucket RLS · session-expiry / remote sign-out runbook · (deferred) external Principal Portal needs
its own review · dormant 0227 governance primitives for a later governance phase · external
pen-test before GA.

## Pilot enablement (ops checklist)

To activate the hardening in a pilot environment, set as protected env:
- `CRON_SECRET` (+ schedule the cron routes), `AUDIT_RETENTION_DAYS` (optional), `LOG_LEVEL`,
  `ALERT_WEBHOOK_URL` (optional), `KAKO_TEMP_ACCESS_ENFORCEMENT=1` (only when piloting temp-access),
  `KAKO_MOBILE=1` (only when piloting the offline client).

## Next

Per the approved roadmap: **Step 3 — Phase 8** in order
**8A → 8D → 8E → 8F → 8C → Drag-and-Drop → 8B → 8G → 8I → 8H → 8J** (design-review-first per phase).
The Principal Intelligence Layer proposal (#239) awaits design-review approval and pairs with 8G.
