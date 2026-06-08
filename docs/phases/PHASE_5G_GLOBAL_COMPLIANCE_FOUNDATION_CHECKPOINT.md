# Phase 5G — Global Tax Compliance Foundation (Checkpoint)

**Status:** ✅ Implemented · additive · reusable · country-agnostic · multi-tenant
safe · rollback-safe · flag-gated (`KAKO_EINVOICE`, default OFF) · **authority
submission PAUSED**. Extends Phase 5F. No live government integrations, no
production credentials, no production submissions, no CI gate bypass.

**Goal:** Saudi Arabia, Egypt, UAE, Jordan, and future countries supportable
**without platform redesign** — activation becomes adapter + onboarding work.

## Part 1 — Global compliance foundation
| # | Capability | Where |
|---|---|---|
| 1 | **Lifecycle engine** — full state set (draft→generated→signed→validated→queued→submitting→submitted→reported→cleared→accepted→accepted_with_warning→rejected→failed→dead_lettered→cancelled) + **configurable per-country transition profiles** (`LifecycleProfile`/`LifecycleRegistry`, ZATCA/ETA examples) | `lifecycle.ts` + 0208 widened CHECK |
| 2 | **Compliance metadata** — UUID, ext/internal invoice number, invoice hash, previous hash, QR ref/payload, XML ref, signed XML ref, submission/clearance/reporting/provider refs, status, last authority response, submission/response timestamps | `metadata.ts` + 0208 |
| 3 | **Submission infra** — queue, retry, **DLQ**, retry scheduling, **failure classification** (transient/rate_limit/auth/validation/permanent), **resubmission** | `queue.ts` |
| 4 | **Certificate infra** — store, **registry**, metadata, **expiry monitoring**, **rotation**, **signature provider interface** (paused) | `certificate-store.ts` (+ 0205) |
| 5 | **Compliance logging** — request/response/error/warning/**status_change**/submission kinds + direction; **status-change history** | 0209 + 0210 (`erp_compliance_status_history`) |
| 6 | **Compliance audit** — created_by/modified_by/submitted_by, submission/response time, status changes, resubmissions | 0208 + 0210 |
| 7 | **Provider registry** — ZATCA, ETA, UAE-FTA, **UAE PEPPOL**, **Jordan**, future; country logic never in invoice entities | `provider.ts` + `providers/*` |

## Part 2 — Company legal & tax profile (0211)
- **Legal entity:** legal_name, trade_name, commercial_registration, vat/tax registration number, national_address + building/street/district/city/province/postal/country_code, industry, tax_regime.
- **Branch:** branch_legal_identifier, branch_tax_identifier, national_address + building/street/district/postal/country_code.
- `erp_tax_registrations` remains the authoritative multi-registration store; profile columns are additive convenience. Supports SA/UAE/EG/JO/BH/QA/OM/KW future requirements.

## Part 3 — Egypt ETA prep
ETA provider adapter (5F) · **item coding** (GS1/GPC/EGS/UNSPSC/internal mapping +
gap validation, `item-coding.ts`) · credit/debit notes (pack) · retry + validation
errors (queue + provider) · audit (logs/history). Reference readiness — no live ETA.

## Part 4 — UAE prep
**PINT-AE / PEPPOL BIS 3.0** types + validation + normalized builder (`peppol.ts`):
electronic addresses, legal identifiers, tax category codes, payment means, business
process, **Message Level Status + ASP responses**; provider `providers/uae-peppol.ts`.
AS4/ASP transport PAUSED. No live FTA/ASP.

## Part 5 — Jordan prep
**JoFotara** provider (`providers/jordan.ts`): cash/receivable/return invoices, QR,
**buyer optionality**, auto-populated seller profile, status tracking, retry, audit.
No live government submission.

## Part 6 — Saudi ZATCA
Invoice UUID · PIH chain · invoice hash · QR refs · signed-XML refs · ZATCA lifecycle
profile · certificate infra · logs · submission + retry queues — all in place.
**CSID, OTP, live certificates, live reporting, live clearance remain PAUSED.**

## Part 7 — Future countries
`catalog.ts` — `COUNTRY_COMPLIANCE_CATALOG` covers SA/EG/AE/JO + planned BH, QA, OM,
KW, MA, TR, EU PEPPOL, GB, IN. Add a country = catalog entry + adapter, no redesign.

## Part 8 — Design rules honoured
Tax Compliance Engine → Provider Registry → {ZATCA, ETA, UAE-FTA, UAE-PEPPOL, Jordan,
future} adapters. Invoice Engine + Compliance Engine + Country Adapter. Additive-only
migrations (0208–0211) · flags OFF · reuse-over-rebuild (augmented `erp_tax_submissions`
+ `erp_legal_entities` + `erp_branches`, no country-specific schema) · multi-company
RLS · audit-first.

## Validation
Typecheck 0 · build 0 · **1000 unit tests** · integration: compliance-schema (5) +
compliance-5g-schema (5) + schema-health FK-coverage & RLS-wrap green · migrations
apply + idempotent.

## Activation later (adapter + onboarding only)
UBL-XML serializers (slot into `EInvoiceDocument`) · ECDSA/CSID signing via the
signature-provider interface + stored certs · Reporting/Clearance/AS4 HTTP clients
implementing `submit` · Supabase gateways for cert store + status history · the
lifecycle engine writing logs/history + draining the retry queue. **No platform redesign.**
