# VANTORA — Phase 5B (Country Pack Framework) Readiness Checkpoint

**Date:** 2026-06-08 · **Status: ✅ Complete — staging-ready behind default-OFF flags.**
The country-pack framework is hardened and ready for the first concrete pack (5C Egypt
ETA). Discipline held: reuse-first · additive-only · flags OFF · multi-tenant RLS +
auditability · country-pack isolation · integration before merge.

## Delivered
- **Pack provider interface + registry** (M6, #190) — `TaxCompliancePack`, versioned
  resolution (highest applicable semver as-of mandate date), capability negotiation. No
  core change to add a country — register a pack.
- **Submission lifecycle** (`0203`, #195) — `erp_tax_submissions`: generic, country-
  agnostic record per (document, pack) with pinned `pack_version`/`schema_version`
  (reproducible regeneration), `document_uuid`/`invoice_hash` (PIH)/`signature_ref`/
  `payload_ref`, status, `authority_response`, `attempts`. Company-RLS; FK-covered;
  one submission per document per pack.
- **Submission state machine** (pure) — enforces `draft→generated→signed→submitted→
  cleared|reported`, `rejected→regenerate`, cancel-from-non-terminal; `onRejected`
  retry-until-max-then-cancel (retry handling + error logging via `last_error`/`attempts`).

## How a country pack plugs in (5C+)
A pack implements generate/sign/submit/poll/validate/report/note, declares its
capabilities + version, and registers with `taxPackRegistry`. The orchestrator resolves
the pack by the company's country/regime, creates an `erp_tax_submissions` row, and
advances it only via the state machine. Capability negotiation prevents calling an
unsupported step (e.g. clearance vs reporting).

## Design notes for pack connectors (handled per-pack in 5C+)
- **Secrets/certs** (ETA signing, ZATCA CSID) — stored in the platform secret store/KMS
  via env, **never in the DB**; `signature_ref` holds a reference only. (Mirrors the
  existing `createServiceClient`/secret-handling pattern used by the integration connectors.)
- **API health surface** — per-pack connectivity/status read from `erp_tax_submissions`
  (counts by status, last error) — a thin read-model when the first connector lands.
- **Idempotent submission** — dedupe by `document_uuid` + the `UNIQUE(reference_type,
  reference_id, pack)` guard; re-submit/poll are safe.

## Verification
- `0203` additive, idempotent, schema-health FK + RLS invariants pass; CI staging-apply green.
- **942 unit + 38 integration tests green**; build clean. No behaviour change (flag-OFF);
  country-pack isolation (each pack/version side-by-side; per-tenant adoption).

## Next
**5C Egypt ETA pack** → 5D Saudi ZATCA → 5E GCC, each registering against this framework
with its own flag (`KAKO_TAX_EG`, `KAKO_TAX_SA`, …) and a readiness checkpoint.

## Stop-conditions
None. No architectural blocker.
