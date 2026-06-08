# VANTORA — ZATCA E-Invoicing Readiness Review & Gap Assessment

**Date:** 2026-06-08 · **Type:** Assessment & gap analysis only — **no implementation, no
migrations, no production changes.** Verified against actual code/schema/migrations on
`main`. **ZATCA authority connectors remain PAUSED** (no certs/credentials/onboarding);
this review does not change that.

> **Status legend:** ✅ Implemented · ◑ Partial · ➕ Not Implemented · ♻ Needs Refactoring

---

## 1. Executive Summary
VANTORA has a **strong, country-agnostic tax + invoicing foundation** (Phase 5 Global Tax
Engine + ZATCA pack 5D + submission lifecycle 5B) and the platform pillars ZATCA depends
on (multi-tenant RLS, audit, posting engine). **What's complete is the data + pure-logic
half** (tax compute, document tax profiles/determination, tax ledger, invoice persistence,
ZATCA invoice normalization + **TLV QR**, submission **state machine**, per-company
registrations). **What's missing is the cryptography/onboarding/API/UI half** — UBL **XML
generation**, **ECDSA signing + CSID**, **CSR/onboarding**, the **Reporting/Clearance APIs**,
a **certificate store**, and the **admin/monitoring UI** — all of which require real ZATCA
certificates/credentials and are deliberately parked.

**Estimated overall ZATCA readiness: ~55%** (foundation/data/pure-logic ≈ done; signing +
onboarding + APIs + UI ≈ not started, pending credentials). **No architectural redesign is
required** — the recommended target architecture (§14) already matches what's built
(pack registry + submission lifecycle + tax core).

---

## 2. Phase 1 — Current State (platform pillars)
| Area | Status | Evidence | Gap / Risk | Recommendation |
|---|---|---|---|---|
| Finance | ✅ | Phase-1 posting engine: `erp_post_journal_entry` (0187), posting rules (0186), Augment GL | none material | reuse for tax GL (done: 0201) |
| Inventory | ✅ | costing engine + `0188` | — | — |
| Purchasing | ✅ | AP + 3-way match (`0190/0191`) | — | input-VAT reconciliation later |
| Sales | ✅ | `erp_invoices`/`erp_invoice_lines` (0005) | header lacks ZATCA fields (see §3) | add via submission table (done) + invoice extensions |
| CRM | ✅ | `erp_customers` (+tax profile, 0199 stamp) | buyer VAT fields per ZATCA | add buyer tax fields |
| Workflow | ✅ | workflow engine (0088–0090) | — | reuse for approval of resubmission |
| Search | ✅ | search index (0185) | — | — |
| Multi-Tenant | ✅ | RLS on all `erp_*`; `erp_user_company_id`/`erp_is_platform_owner` | — | maintained on all tax tables |
| Security | ◑ | integration credential crypto (`integration-crypto.ts`); RLS | no cert/key store yet | add KMS-backed cert store |
| Audit | ✅ | `erp_audit_logs`, `erp_integration_logs`, `erp_tax_submissions.attempts/last_error` | payload history thin | add request/response payload retention |
| Compliance | ◑ | Phase-5 tax core + ZATCA pack 5D + submission lifecycle 5B | signing/API/onboarding missing | this roadmap |

## 3. Phase 2 — Invoice Architecture
**Header** — `erp_invoices` (0005) has invoice_number, date, status, net/paid amounts;
`document_tax_profile_id` (0199) gives Standard/Simplified/Credit/Debit via the profile
catalog (0198). ZATCA-specific fields (**UUID, PIH previous-hash, invoice hash, QR, XML,
signed XML, ZATCA status**) live on **`erp_tax_submissions` (0203)** (`document_uuid`,
`invoice_hash`, `signature_ref`, `payload_ref`, `status`, `authority_response`).

| Field | Status | Evidence / Gap |
|---|---|---|
| Invoice UUID | ◑ | `erp_tax_submissions.document_uuid` (column exists; not yet generated) |
| Invoice Number / Date | ✅ | `erp_invoices` |
| Invoice **Time** | ➕ | only `date`; add time/`issue_datetime` (ZATCA needs timestamp) |
| Invoice Type (Standard/Simplified/CN/DN) | ✅ | document tax profiles (0198) + determination (0200) |
| Currency | ◑ | legal-entity `base_currency` (0202); per-invoice currency field ➕ |
| Seller / Buyer details + VAT number | ◑ | seller via `erp_tax_registrations` (0202); buyer VAT field ➕ on customer/invoice |
| Subtotal / Discount / VAT / Total | ✅ | tax engine (M1/M2) + `erp_tax_document_lines` (0197) |
| Previous Invoice Hash (PIH) / Invoice Hash | ◑ | `invoice_hash` column exists; **hash-chain generation ➕** |
| QR Code | ◑ | **TLV QR generator built** (`zatca.ts` `generateZatcaTlvQr`); signed QR (with hash+ECDSA+pubkey) ➕ |
| XML / Signed XML | ➕ | **UBL XML serializer not built** |
| ZATCA Status | ✅ | `erp_tax_submissions.status` + state machine (5B) |

**Invoice Lines** — `erp_invoice_lines` (0005) + `erp_tax_document_lines` (0197) cover
product code/name/desc/unit/qty/unit price/discount/VAT %/VAT amount/line total ✅.
**Batch/expiry (future)** — `erp_goods_receipt_lines` has batch/expiry; extensible to
invoice lines additively ✅ (future-ready). **Risk:** none material; line model is sound.

## 4. Phase 3 — ZATCA Compliance Layer
| Item | Status | Evidence | Gap | Risk | Recommendation |
|---|---|---|---|---|---|
| XML Builder / versioning / validation / storage / regeneration | ➕ | ZATCA pack normalizes invoice + validates fields; **no UBL 2.1 XML** | full UBL serializer + schema/schematron validation + storage (`payload_ref`) + version pin (`pack_version`) | high (statutory format) | build UBL serializer as a pack capability; store payload; pin version (model ready) |
| QR (name/VAT/timestamp/total/VAT) | ✅ | `generateZatcaTlvQr` (TLV tags 1–5, tested) | — | — | — |
| QR (invoice hash / ECDSA sig / public key / crypto stamp — tags 6–9) | ➕ | not built (needs signing) | tags 6–9 require the signed XML + CSID | high | part of signing engine (paused) |
| Digital signature (ECDSA, key storage, XML signing, validation) | ➕ | not built; **no certs/keys** | ECDSA signing + CSID-bound keys | high (crypto + secrets) | signing engine + KMS cert store; **paused pending creds** |

## 5. Phase 4 — Onboarding
| Item | Status | Evidence | Gap |
|---|---|---|---|
| Company setup (VAT, name, branch, industry, location, country, invoice types) | ◑ | `erp_companies`/`erp_branches`/`erp_legal_entities`+`erp_tax_registrations` (reg number, country) | ZATCA-specific onboarding fields + UI |
| CSR generation / key pair / OpenSSL | ➕ | not built | CSR + EC keypair generation (server, OpenSSL/`node:crypto`) |
| Compliance CSID (OTP, request tracking, storage) | ➕ | not built | CSID flow + secure storage |
| Production CSID (secret storage, rotation) | ➕ | not built | KMS-backed CSID + rotation |
| Renewal (expiry monitoring, renewal, notifications) | ➕ | not built | expiry monitor + notifications |
**Risk:** high (security-critical, external). **Recommendation:** dedicated onboarding +
certificate-store milestone — **paused until ZATCA credentials/sandbox available.**

## 6. Phase 5 — ZATCA APIs
Reporting API, Clearance API, Compliance APIs — **➕ Not Implemented.** The **submission
lifecycle + state machine (5B)** and `erp_tax_submissions` are the landing model; the HTTP
connectors (auth via CSID, base64 invoice, UUID/hash, error handling, response tracking,
cleared-XML/QR handling, status sync, sandbox) are **paused pending credentials**.
**Risk:** high (external dependency). **Recommendation:** build as flagged connector
increments on 5B once onboarded.

## 7. Phase 6 — Security Review
| Item | Status | Evidence / Finding |
|---|---|---|
| Auth (CSID/secret/headers/versioning) | ➕ | not built (paused) |
| Secret mgmt — encryption at rest | ◑ | `integration-crypto.ts` exists for integration creds; **no CSID/cert store yet** |
| Rotation / vault / access control | ➕ | needs KMS + rotation for CSID |
| **Hardcoded secrets** | ✅ none | secrets read from env (`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`); none in repo/DB |
| Privilege escalation | ✅ low | service-role confined to guarded internal routes; RLS elsewhere |
| Multi-tenant risk | ✅ low | company-scoped RLS on all tax/submission tables |
| Certificate risk | ➕ | no cert store yet → must be KMS-backed, never DB plaintext |
**Recommendation:** CSID/cert store via KMS with per-company isolation + rotation, before any live submission.

## 8. Phase 7 — Invoice Lifecycle (state machine)
✅ Implemented (5B `packs/submission.ts` + `0203` status): `draft→generated→signed→
submitted→cleared|reported→rejected→(regenerate)`, cancel-from-non-terminal, retry-to-max.
**Gap (◑):** explicit `validated`, `accepted`, `accepted_with_warning`, `failed` states are
not all distinct (mapped to generated/cleared/rejected). **Recommendation:** extend the
status enum + transitions to add `validated`/`accepted_with_warning`/`failed` (additive
CHECK change) when wiring the APIs.

## 9. Phase 8 — Error Handling
| Item | Status | Evidence / Gap |
|---|---|---|
| Validation errors | ◑ | pack `validate*` returns structured issues; not wired to submission |
| API errors / retry | ◑ | `sync-tick` backoff + `onRejected` retry-to-max; not wired to ZATCA |
| Dead-letter queue | ➕ | none explicit (terminal `cancelled` after max attempts approximates) |
| Resubmission | ◑ | state machine `rejected→generated` regenerate |
| Warning handling | ➕ | `accepted_with_warning` not modelled |
**Recommendation:** add a DLQ view over `erp_tax_submissions` (status=failed/cancelled) + warning capture in `authority_response`.

## 10. Phase 9 — Audit & Compliance
Audit trail ✅ (`erp_audit_logs`, created/updated, `attempts`, `last_error`,
`authority_response`); submission/response times ◑ (timestamps present; explicit
submitted_at/response_at ➕). Compliance logs (request/response payloads) ◑ (`payload_ref`
+ `authority_response`; full payload history retention ➕). Retention strategy ➕ (define
per statutory period — ZATCA 6 years). **Recommendation:** add submitted_at/cleared_at +
payload retention policy.

## 11. Phase 10 — Database Review
| Entity | Status | Table |
|---|---|---|
| Companies / Branches / Customers | ✅ | `erp_companies`/`erp_branches`/`erp_customers` |
| Invoices / Invoice Lines | ✅ | `erp_invoices`/`erp_invoice_lines` (+ `erp_tax_document_lines`) |
| Invoice XML / Signatures | ➕ | store via `payload_ref`/`signature_ref` refs (object storage) — schema-ready, not wired |
| CSIDs / CSR Requests / Certificate Store | ➕ | not built (KMS-backed, paused) |
| ZATCA Responses | ◑ | `erp_tax_submissions.authority_response` |
| Audit Logs | ✅ | `erp_audit_logs` |
| Retry Queue | ◑ | `erp_sync_runs` / submission attempts |
**Normalization** ✅ · **Indexing** ✅ (FK-covered, schema-health enforced) · **Scalability**
✅ (period/company indexes; sub-ledger) · **Multi-tenant isolation** ✅ (RLS). **Gap:** a
dedicated **certificate/CSID store** + XML/signature blob storage refs.

## 12. Phase 11 — Multi-Tenant Review
✅ Company isolation (RLS on `erp_tax_*`, `erp_tax_submissions`, `erp_tax_registrations`);
per-company VAT numbers (`erp_tax_registrations`); branches (`erp_branches`). Company
**certificates/CSIDs** ➕ (store not built — must be per-company KMS-isolated). **Verified:
one tenant cannot read another's tax/submission data** (RLS `company_id = erp_user_company_id()`
on every tax table; e2e RLS tests in prior phases). **Risk:** when the cert store is added
it MUST carry the same isolation + never expose keys cross-tenant.

## 13. Phase 12–13 — UI & Health Dashboard
**UI ➕ Not Implemented:** no ZATCA setup / certificate management / submission status /
error review / resubmission screens (company admin); no platform-owner tenant/integration/
cert-expiry/compliance monitoring. **Integration Health dashboard ➕** (planned as Phase
6C — API availability, success/rejection/warning rates, cert expiry, queue backlog — over
`erp_tax_submissions`/`erp_sync_runs`). **Recommendation:** build on the Phase-3.x
StatCard/read-model pattern after the APIs land.

## 14. Phase 14 — Future Tax Engine (target architecture fit)
**Recommended architecture vs. what exists:**
| Target component | VANTORA status |
|---|---|
| Tax Compliance Engine | ✅ Phase-5 core (codes/groups/determination/ledger/posting) |
| ZATCA / ETA / UAE adapters | ◑ pure packs built (5C/5D/5E); connectors paused |
| XML Generator | ➕ (UBL serializer) |
| QR Generator | ✅ (ZATCA TLV) |
| Signing Engine | ➕ (paused, needs certs) |
| Certificate Store | ➕ (KMS, paused) |
| Submission Engine | ◑ lifecycle + state machine (5B); HTTP connectors paused |
| Retry Engine | ✅ (sync-tick + onRejected) |
| Audit Engine | ✅ (`erp_audit_logs` + submission audit) |
**Verdict: VANTORA can support this WITHOUT redesign** — the M6 pack registry + 5B
submission lifecycle + Phase-5 tax core already match the recommended architecture; the
missing components are additive (serializer, signing, cert store, HTTP connectors, UI).

---

## 15. Deliverables Summary
- **Current readiness:** ~55% (data + pure-logic + multi-tenant done; signing/onboarding/APIs/UI not started).
- **Implemented (✅):** tax compute (incl/excl/groups/kinds/CN-DN), document tax profiles + determination, tax ledger + VAT return, GL posting (Augment), invoice/line persistence, **ZATCA invoice normalization + TLV QR**, submission **state machine**, legal entity + **per-company VAT registration**, multi-tenant RLS, audit, retry.
- **Partial (◑):** invoice ZATCA fields (UUID/hash/QR via submissions), secret/cert handling, error/warning handling, audit payload retention, lifecycle extra states.
- **Missing (➕):** UBL **XML generation**, **ECDSA signing + CSID**, **CSR/onboarding**, **Reporting/Clearance/Compliance APIs**, **certificate store**, **admin + monitoring UI**, DLQ, renewal/expiry.
- **Technical risks:** UBL/schematron correctness; PIH hash-chain ordering under concurrency; lifecycle-state completeness.
- **Security risks:** CSID/private-key storage (must be KMS, per-tenant, rotated; never DB plaintext); cert isolation.
- **Scalability risks:** low — sub-ledger + indexed + per-company; submission volume handled by the existing claim/tick + queue pattern.
- **DB changes required (future, additive):** certificate/CSID store; invoice issue_datetime + currency + buyer VAT; submitted_at/cleared_at + payload retention; lifecycle status extension.
- **UI changes required:** ZATCA onboarding + cert mgmt + submission/error/resubmission (admin); tenant/cert/compliance monitoring (platform owner) + integration-health dashboard.
- **API changes required:** ZATCA Reporting/Clearance/Compliance HTTP connectors (auth via CSID).

## 16. Priority Roadmap (architecture/backlog — build PAUSED pending credentials)
1. **Onboarding + Certificate Store (KMS)** — CSR/keypair, Compliance + Production CSID, rotation, expiry monitor. *(unblocks everything; needs ZATCA sandbox creds)*
2. **UBL XML generator + validation + storage** (pack capability; version-pinned).
3. **Signing engine (ECDSA) + signed QR (tags 6–9) + invoice/PIH hash chain.**
4. **Reporting + Clearance API connectors** on the 5B lifecycle (sandbox → production).
5. **Lifecycle/error completeness** (validated/accepted_with_warning/failed + DLQ + resubmission).
6. **Admin UI + Platform monitoring + Integration-Health dashboard** (reuse Phase-3.x read-model pattern).
7. **Audit payload retention** (6-year) + compliance logs.

**All items are additive on the approved Phase-5 baseline; none require redesign. Build
remains paused until ZATCA certificates/credentials/onboarding are available.**
