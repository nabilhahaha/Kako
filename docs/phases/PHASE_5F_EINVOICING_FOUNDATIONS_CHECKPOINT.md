# Phase 5F — E-Invoicing Compliance Platform Foundations (Checkpoint)

**Status:** ✅ Implemented · additive · flag-gated (`KAKO_EINVOICE`, default OFF) ·
country-agnostic · **authority submission remains PAUSED** (no certs/credentials).

## Why
Close the platform gaps from the ZATCA Readiness Assessment (≈55%) **without**
touching the paused authority connectors. Build every reusable, country-agnostic
foundation now so that when credentials arrive, ZATCA (and ETA/FTA) activation is
**connector work, not a platform redesign**.

## Scope — built (reusable, country-agnostic)

### Pure engine (`src/lib/compliance/`, DB-free, 23 unit tests)
| Module | Capability |
|---|---|
| `flags.ts` | `KAKO_EINVOICE` (default OFF) |
| `lifecycle.ts` | Country-agnostic compliance lifecycle state machine (draft→generated→signed→queued→submitting→cleared/reported/rejected→failed→dead_lettered→cancelled) — supersets the Phase-5 tax submission machine |
| `hash.ts` | Invoice hash + **previous-invoice-hash (PIH) chain** (SHA-256/Base64, genesis), verify |
| `queue.ts` | **Submission + retry/dead-letter** model — exponential backoff (capped), attempt budget, DLQ transition, due-check (clock injected) |
| `certificate-store.ts` | **Certificate store contract** — metadata + lifecycle + encrypted-material *refs* (never inline keys); usability + selection; DB-free gateway interface |
| `health.ts` | **Integration/compliance health** read-model — per-provider counts, last activity, error rate, traffic-light status |
| `provider.ts` | **Country compliance abstraction** — `EInvoiceProvider` interface + registry; `PausedConnectorError` |
| `document.ts` | Assembly: validate → build → UUID → PIH chain → lifecycle status |
| `providers/{zatca,eta,uae}.ts` | **ZATCA / ETA / UAE provider interfaces** — offline surface real (validate/build/QR); `submit()` throws `PausedConnectorError` |

### Schema (additive migrations 0205–0207, RLS + FK-covering, idempotent)
- **0205 `erp_compliance_certificates`** — certificate store (kind sandbox/production, status lifecycle, validity window, csr_ref/material_ref handles, per company/entity/registration).
- **0206** — augments `erp_tax_submissions` (reuse-first): `previous_invoice_hash`, `qr_payload`, `xml_payload_ref`, `signed_xml_ref`, `certificate_id` (FK→0205), `compliance_metadata`, `max_attempts`/`next_attempt_at`/`dead_lettered_at`; widens the status CHECK to the full lifecycle.
- **0207 `erp_compliance_logs`** — append-only compliance audit/log (linked to submission/certificate; level + event_type + detail).

### Reused (already present — not rebuilt)
Tax profiles (`erp_document_tax_profiles`), company/branch VAT profiles
(`erp_legal_entities` + `erp_tax_registrations` + `erp_branches.legal_entity_id`),
the generic submission record (`erp_tax_submissions`, incl. `document_uuid` =
invoice UUID, `invoice_hash`), ZATCA TLV QR generator, determination/ledger/GL.

## Coverage of the requested foundations
Invoice UUID ✓ · lifecycle states ✓ · invoice hash ✓ · previous-invoice hash ✓ ·
QR architecture ✓ · XML + signed-XML storage refs ✓ · ZATCA status lifecycle ✓ ·
tax profile entities ✓ · company VAT profile ✓ · branch VAT profile ✓ · invoice
compliance metadata ✓ · compliance audit tables ✓ · submission queue ✓ · retry/DLQ
queue ✓ · compliance log entities ✓ · certificate store ✓ · integration health
model ✓ · country compliance abstraction ✓ · ZATCA/ETA/UAE provider interfaces ✓.

## Explicitly NOT built (remains PAUSED)
Live ZATCA/ETA/FTA API calls · CSID onboarding · certificate issuance · OTP flow ·
production credentials · authority submission. `submit()` throws `PausedConnectorError`;
all storage holds *refs* to material that does not yet exist.

## Validation
Typecheck 0 · build 0 · 982 unit tests (+23) · integration: compliance-schema (5)
+ schema-health FK-coverage & RLS-wrap invariants green · migrations apply + idempotent.

## What activation will need later (connector work only)
UBL-XML serializer (slots into `EInvoiceDocument.format`/`content`) · ECDSA signing
against a stored certificate · Reporting/Clearance HTTP clients implementing
`EInvoiceProvider.submit` · a Supabase `CertificateStoreGateway` impl · the lifecycle
engine writing `erp_compliance_logs` + driving the retry queue. No schema redesign.
