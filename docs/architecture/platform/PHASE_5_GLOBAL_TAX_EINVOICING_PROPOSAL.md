# VANTORA — Phase 5: Global Tax & E-Invoicing Framework (Architecture Proposal)

**Status:** 🔵 **Architecture review / design proposal only — NO implementation, NO
migrations, NO code.** Formalizes and supersedes the earlier backlog capture
`COUNTRY_COMPLIANCE_EINVOICING_ARCHITECTURE.md` into a phased, platform-wide framework.
**Classification:** Platform Foundation Capability · **Priority: High** (precedes
commercial onboarding in KSA/Egypt).

## 0. Principles (inherited from Phases 1–4, non-negotiable)
- **Platform-wide, not FMCG-specific.** Tax is a *core* capability used by every
  industry pack: Distribution, FMCG, Retail, Wholesale, Pharmacy, Clinics,
  Manufacturing, Service, and future packs.
- **Platform + Pack architecture** (the proven VANTORA pattern): a generic core +
  country **packs** registered as data/providers (mirrors Search providers, the export-
  handler registry, posting-rule engine, and industry packs).
- **Reuse-over-rebuild:** the **Phase-1 posting engine** posts every tax leg (Augment
  model, distinct reference types); `erp_audit_logs`, RLS, jobs/tick, events are reused.
- **Additive-only, flags OFF, multi-tenant RLS, auditability** — same discipline as 1–4.
- **Country-agnostic core:** no country logic in the tax engine or GL; packs plug in.

---

## 1. Global Tax Engine (Phase 5A — Core Platform)

A pure, country-agnostic tax computation + ledger core.

### 1.1 Concepts
- **Tax Codes** — a named rate + behaviour (e.g. `EG_VAT_14`, `SA_VAT_15`, `ZERO`,
  `EXEMPT`, `OUT_OF_SCOPE`). Fields: code, name, rate %, kind (`standard|zero|exempt|
  out_of_scope|reverse_charge`), is_recoverable, effective dates.
- **Tax Groups** — an ordered set of tax codes applied together (compound/multi-rate,
  e.g. VAT + excise; or jurisdiction splits). Resolves to one or more lines.
- **VAT Rules** — resolution policy: which tax code applies given (product tax category,
  customer/supplier tax profile, place of supply, transaction type). Data-driven, like
  posting rules.
- **Inclusive vs Exclusive** — a flag per document/line; the engine derives base/tax:
  exclusive `tax = base × rate`; inclusive `tax = gross × rate/(1+rate)`, `base = gross − tax`.
- **Multi-rate / compound** — via tax groups; each component computed and laddered
  (tax-on-tax only when a jurisdiction requires it; default non-compound).
- **Zero-rated vs Exempt vs Out-of-scope** — distinct kinds (zero = 0% but reportable +
  recoverable inputs; exempt = no tax, no input recovery; out-of-scope = excluded).
- **Credit / Debit notes** — signed adjustments referencing the original document; the
  engine recomputes tax on the delta and the ledger nets it.

### 1.2 Pure engine (TS, no DB — mirrors costing/match/accrual engines)
```
computeTax(lines[], { inclusive, taxResolution, placeOfSupply }) → TaxBreakdown
  per line: { base, taxCode, rate, taxAmount, kind }
  totals:   { net, taxByCode{}, gross }
applyNoteAdjustment(original, delta) → signed tax breakdown
```
Deterministic, rounding-policy aware (per-line vs per-invoice rounding is a config), and
fully unit-testable before any DB.

### 1.3 Tax Ledger & Reporting
- **Tax Ledger** — every taxable event writes a tax-ledger entry (output/input, tax code,
  base, tax, document ref, period). The single source for returns + reconciliation.
- **Tax Reports** — VAT return (output − input = net payable), tax-code summaries,
  per-period/per-entity; pure report builders over the ledger (country pack maps to the
  statutory form).
- **Tax Posting Integration** — the **existing Phase-1 poster** books the GL legs (Dr/Cr
  Output/Input VAT) under distinct reference types; the tax ledger is the sub-ledger.
- **Audit Trail** — `erp_audit_logs` for every config + submission + adjustment.

---

## 2. Country Pack Architecture (Phase 5B — Pack Framework)

A **`TaxCompliancePack` provider interface** (registry, like Search providers / export
handlers), selected per company by country + regime:
```
interface TaxCompliancePack {
  country; regime;
  resolveTaxCode(ctx) : TaxCode            // statutory rate/kind selection
  serialize(doc)      : payload            // XML (UBL)/JSON per authority
  sign(payload)       : signed             // cert/CSID handling
  submit(signed)      : ack                // clearance/reporting connector
  poll(ref)           : status             // submission lifecycle
  validate(doc)       : ValidationResult[] // pre-submission statutory rules
  report(period)      : statutoryReturn    // maps tax ledger → the official form
  note(credit|debit)  : payload            // CN/DN handling
}
```
- **No core change to add a country** — register a pack. Future countries plug in.
- Packs are **flag-gated** (`KAKO_TAX_<CC>`); core tax can run (compute+ledger+GL)
  without any pack (generic VAT), packs add e-invoicing/clearance/statutory forms.

### Initial packs
| Pack | Scope |
|------|-------|
| **Egypt (ETA)** | e-invoice + e-receipt, JSON generation, digital signature, submission API, validation rules, taxpayer/branch/activity + GS1/EGS code mapping. Extends existing `erp_company_eta_settings` / `erp_invoices_eta_status`. |
| **Saudi (ZATCA)** | Phase 1 (QR + invoice fields) and Phase 2 (UBL 2.1 XML, UUID + PIH hash chain, CSID signature, **clearance** (B2B) / **reporting** (B2C)). |
| **UAE (FTA)** | VAT reporting + e-invoicing readiness. |
| **Bahrain (NBR)** | NBR VAT compliance + reporting. |
| **Oman (OTA)** | OTA VAT compliance. |
| **Kuwait** | future tax readiness (scaffold; activate when a regime is published). |

---

## 3. Multi-Tenant Design
- **Different country/regime per company** — company tax profile selects the active pack
  + regime; resolution is per-company, RLS-scoped.
- **Multiple legal entities** — a `legal_entity` dimension under company (a company may
  have entities in different jurisdictions); tax registration, ledger, and returns are
  per legal entity. (New `erp_legal_entities`; existing data defaults to a primary entity
  — additive, no redesign.)
- **Future countries without schema redesign** — tax codes/groups/rules + packs are
  **data + providers**, not schema. The data model (below) is country-agnostic.
- All tax tables company/entity-scoped via RLS (`erp_user_company_id()` + entity).

---

## 4. Accounting Integration (reuse existing engines)
| Existing engine | Integration |
|-----------------|-------------|
| **Posting engine (Phase 1)** | Books tax legs (Output/Input VAT) via seeded posting rules + new reference types (`tax_output`, `tax_input`, `tax_adjustment`). Zero double-post (Augment). |
| **GL engine** | Tax ledger is a sub-ledger reconciled to the VAT control accounts. |
| **Settlement engine (Phase 3)** | Collections/payments unaffected; tax already on the invoice. |
| **Trade Spend / ROI (Phase 4)** | Trade-spend claims/credit notes flow tax adjustments through the same tax engine + ledger. |
| **Events** | `invoice.issued` / `goods.received` / credit-note events trigger tax computation + (pack) submission asynchronously via the existing bus + jobs/tick. |

Critically: **the compliance layer consumes finalized invoice/journal data** and posts
only tax legs — it never changes core posting logic (the Augment guarantee from Phase 1).

---

## 5. Tax Data Model (proposal — additive `erp_tax_*`)
> Names/shapes are a proposal for the review; no migration is created here.

- **ERP Tax Configuration**
  - `erp_tax_codes` (company_id, code, name, kind, rate, is_recoverable, effective_from/to)
  - `erp_tax_groups` + `erp_tax_group_members` (compound/multi-rate sets)
  - `erp_tax_rules` (resolution: product category × customer/supplier profile × place of
    supply × txn type → tax code/group; priority; data-driven like posting rules)
  - `erp_product_tax_categories`, `erp_customer_tax_profiles`, `erp_supplier_tax_profiles`
  - `erp_legal_entities` (+ tax registration numbers per entity)
- **ERP Tax Transactions**
  - `erp_tax_document_lines` (per source line: base, tax_code, rate, tax_amount, kind,
    inclusive flag) — the computed breakdown attached to invoices/bills/notes
- **ERP Tax Ledger**
  - `erp_tax_ledger` (legal_entity, period, direction output|input, tax_code, base, tax,
    reference_type, reference_id, status) — the returns/reconciliation source
- **ERP Country Compliance**
  - `erp_tax_submissions` (legal_entity, pack, document ref, payload ref, uuid/hash,
    signature ref, status lifecycle draft→generated→signed→submitted→cleared|rejected,
    authority response) — extends the existing ETA status concept generically
  - secrets/certs in KMS/vault, never in DB

All RLS company/entity-scoped, FK-covered, additive; audit via `erp_audit_logs`.

---

## 6. Release Strategy — what lives where
| Layer | Contents |
|-------|----------|
| **Core Platform** | Tax engine (codes/groups/rules/VAT calc/inclusive-exclusive/CN-DN), tax ledger, generic VAT reports, posting integration, audit, tax data model, legal-entity dimension. |
| **Country Packs** | Statutory rate sets, e-invoice serialization (XML/JSON), signature/cert, clearance/reporting connectors, validation rules, statutory return mapping, QR/UUID/PIH. |
| **Industry Packs** | Only product **tax-category defaults** + any sector nuances (e.g. pharmacy exemptions, clinic services VAT treatment). No tax *logic* — they configure the core. |

Guiding rule: **logic that is statutory → country pack; logic that is universal → core;
sector defaults/config → industry pack.**

---

## 7. Roadmap (phased, each flag-gated, reviewed)
| Sub-phase | Scope | Depends on |
|-----------|-------|------------|
| **5A — Global Tax Engine** | Pure engine + tax data model + ledger + generic VAT report + posting integration + audit. | Phase-1 poster (done). |
| **5B — Country Pack Framework** | `TaxCompliancePack` interface + registry + submission lifecycle model + secrets handling + health surface. | 5A. |
| **5C — Egypt ETA Pack** | e-invoice/e-receipt JSON, signature, submission API, validation, code mappings (extends existing ETA tables). | 5A, 5B. |
| **5D — Saudi ZATCA Pack** | Phase 1 (QR) + Phase 2 (UBL XML, UUID/PIH, CSID, clearance/reporting). | 5A, 5B. |
| **5E — GCC Expansion** | UAE FTA, Bahrain NBR, Oman OTA, Kuwait readiness. | 5A, 5B. |

---

## 8. Risks
- **Statutory change risk** — authorities change formats/rules; mitigated by pack
  isolation + versioned serializers (like field-config versioning).
- **Cryptography / certs** — CSID (ZATCA) + ETA signing need secure key storage,
  rotation, and the PIH hash chain ordered under concurrency (serialize per entity).
- **Rounding & legal correctness** — per-line vs per-invoice rounding differs by country;
  must be config + heavily tested; tax correctness is audit-sensitive (data-integrity-first).
- **Inclusive/exclusive + multi-rate edge cases** — extensive pure-engine test matrix
  required before any wiring.
- **Idempotency of submissions** — never double-submit/clear; dedupe by document UUID.
- **Migration of existing invoices** — backfill tax breakdown for in-flight documents
  (additive, default to a primary entity + derived tax category).

## 9. Dependencies
- Phase-1 posting engine + `erp_account_map` (tax control accounts) — **present**.
- `erp_audit_logs`, RLS helpers, events/jobs-tick, secrets/KMS — present/available.
- Legal-entity dimension (new, additive) — prerequisite for multi-jurisdiction.
- Existing ETA scaffolding (`erp_company_eta_settings`, `erp_invoices_eta_status`) — Egypt pack extends it.

## 10. Estimated complexity
| Sub-phase | Complexity | Notes |
|-----------|------------|-------|
| 5A Core tax engine | **High** | Pure engine is moderate; ledger + posting integration + rounding correctness is the bulk. |
| 5B Pack framework | **Medium** | Mirrors existing registry patterns; submission lifecycle + secrets are the new parts. |
| 5C Egypt ETA | **Medium-High** | JSON + signature + API; eased by existing ETA tables. |
| 5D Saudi ZATCA | **High** | UBL XML + PIH chain + CSID + clearance is the most demanding pack. |
| 5E GCC | **Medium** (each) | UAE/Bahrain/Oman reporting; Kuwait scaffold-only. |

## 11. Recommended implementation order
1. **5A pure tax engine** (codes/groups/rules + VAT calc + inclusive/exclusive + CN/DN)
   — pure, fully tested, no DB (the proven first step).
2. **5A tax data model + ledger** (additive migration) + **posting integration** (seed
   tax posting rules, reuse the poster) + generic VAT report.
3. **5B pack framework** (interface + registry + submission lifecycle model, flag-gated).
4. **5C Egypt ETA** (highest near-term commercial need; extends existing ETA tables).
5. **5D Saudi ZATCA** (Phase 1 then Phase 2).
6. **5E GCC** packs as markets open.

Each sub-phase: additive migrations, flags OFF, RLS + audit, tests + integration before
merge, reusing the posting engine — identical discipline to Phases 1–4.

---

**This is an architecture proposal for review only.** No code, migrations, or schema
changes are included. On sign-off, Phase 5A (pure tax engine) begins under the same
engineering discipline used throughout VANTORA.
