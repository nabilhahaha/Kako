# VANTORA — Phase 5: Global Tax & E-Invoicing Framework (Architecture Proposal)

**Status:** 🔵 **Architecture review / design proposal only — NO implementation, NO
migrations, NO code.** Formalizes and supersedes the earlier backlog capture
`COUNTRY_COMPLIANCE_EINVOICING_ARCHITECTURE.md` into a phased, platform-wide framework.
**Classification:** Platform Foundation Capability · **Priority: High** (precedes
commercial onboarding in KSA/Egypt).
**Revision (rev 2):** expanded per review to explicitly cover the **legal-entity dimension
(§3.1)**, **multiple VAT registrations per company (§3.2)**, **effective-dated tax rules
(§3.3)**, and the **country-pack versioning strategy (§2.1)**.

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

### 2.1 Country-pack versioning strategy (explicit)
Tax authorities change formats and rules on their own cadence (ZATCA phases, ETA schema
revisions, rate changes, new validations). Packs must evolve **without breaking already-
issued documents or in-flight tenants**.
- **Each pack is versioned** (semver-style `pack_version`, e.g. `zatca@2.3.0`), and each
  capability inside it — **serializer schema**, **validation ruleset**, **signature
  profile**, **submission endpoint** — carries its own version. A pack registers
  *multiple* concurrent versions; the core keeps them side-by-side.
- **Documents pin the version used.** Every submission records the `pack_version` (and
  serializer/schema version) it was generated with, stored on `erp_tax_submissions`. A
  reprint/retry/credit-note of an old document **regenerates with the pinned version**, so
  history is reproducible and audit-stable.
- **Per-tenant adopted version + effective date.** A legal entity is pinned to a pack
  version with an `effective_from`; the active version is resolved **as-of the document tax
  point** (ties into §3.3 effective dating). An authority mandate date is modelled as the
  `effective_from` of the new version.
- **Adoption is explicit + audited**, not automatic: publishing `zatca@2.4.0` does **not**
  retroactively change existing tenants; an admin (or a scheduled mandate date) adopts it.
  Mirrors the field-config / role-template version-adoption pattern already in VANTORA.
- **Backward-compatibility window:** the core retains prior pack versions for as long as
  open documents may need regeneration/amendment; deprecation is a documented, dated step.
- **Capability negotiation:** a pack version advertises which features it supports
  (clearance vs reporting, e-receipt, CN/DN), so the orchestrator degrades gracefully and
  never calls an unsupported capability.

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

### 3.1 Legal Entity dimension (explicit)
A company may operate **multiple legal entities** (e.g. an EG SAE + a KSA LLC under one
VANTORA tenant). Tax is computed, ledgered, reported, and submitted **per legal entity** —
the legal entity, not the company, is the taxpayer.
- New additive table **`erp_legal_entities`** (id, company_id, name, country, base_currency,
  default flag, status). Branches/warehouses optionally map to a legal entity
  (`erp_branches.legal_entity_id`, nullable additive).
- **Backfill-safe:** every existing company gets one **primary legal entity**; existing
  branches map to it. No behaviour change; no redesign — purely additive.
- The active **country pack + regime is chosen per legal entity** (an EG entity uses the
  ETA pack; a KSA entity uses ZATCA) — so one tenant can run several regimes at once.
- RLS: all tax tables scoped by `company_id` **and** `legal_entity_id`.

### 3.2 Multiple VAT registrations per company (explicit)
A legal entity (and therefore a company) may hold **more than one tax registration** —
e.g. VAT + excise registrations, a group/branch registration, or registrations in
multiple jurisdictions for cross-border trade.
- New additive table **`erp_tax_registrations`** (id, company_id, legal_entity_id, country,
  regime, tax_kind `vat|excise|withholding|…`, registration_number, status,
  effective_from/to, is_default). **One legal entity → many registrations.**
- A transaction resolves to the registration by **(legal entity, country/place of supply,
  tax kind)**; the chosen registration stamps the tax-ledger entry and the e-invoice
  payload (the number printed on the document).
- Returns/reporting are produced **per registration per period** (the statutory filing
  unit), not merely per company.
- Guards: unique active registration per (legal_entity, country, tax_kind) window;
  overlapping effective windows rejected.

### 3.3 Effective-dated tax rules (explicit)
Every tax artefact is **effective-dated** so rate changes and rule changes are handled
without mutating history (e.g. KSA VAT 5%→15%, or an exemption introduced mid-year).
- `erp_tax_codes`, `erp_tax_rules`, `erp_tax_groups`, and `erp_tax_registrations` all carry
  **`effective_from` / `effective_to`** (NULL = open-ended).
- **Resolution is as-of the document tax-point date** (invoice/supply date), never "now":
  the engine selects the code/rule whose window contains the tax point. A back-dated
  invoice gets the rate that was in force then; a credit note inherits the **original**
  document's tax point.
- **No in-place edits** to a live rate — a change is a **new effective-dated row**; the old
  row is retained for audit + recomputation. (Same versioning philosophy as field-config
  versions and role-template versions.)
- Overlap/gap validation per (scope, tax kind); a uniqueness guard prevents two codes
  being in force for the same scope at the same instant.

### 3.4 Future countries without schema redesign
Tax codes/groups/rules + registrations + packs are **data + providers**, not schema —
adding a country is registering a pack + seeding its codes/rules. The data model is
country-agnostic. New regimes, rates, and even new tax *kinds* (e.g. withholding) are
additive rows, not migrations to existing tables.


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
  - `erp_legal_entities` (company_id, name, country, base_currency, is_default, status) — the taxpayer dimension (§3.1)
  - `erp_tax_registrations` (legal_entity_id, country, regime, tax_kind, registration_number, is_default, **effective_from/to**) — many per entity (§3.2)
  - `erp_tax_codes` (company_id, code, name, kind, rate, is_recoverable, **effective_from/to**)
  - `erp_tax_groups` + `erp_tax_group_members` (compound/multi-rate sets, **effective_from/to**)
  - `erp_tax_rules` (resolution: product category × customer/supplier profile × place of
    supply × txn type → tax code/group; priority; **effective_from/to**; data-driven like posting rules)
  - `erp_product_tax_categories`, `erp_customer_tax_profiles`, `erp_supplier_tax_profiles`
  - All resolution is **as-of the document tax point** (§3.3); changes are new effective-dated rows, never in-place edits.
- **ERP Tax Transactions**
  - `erp_tax_document_lines` (per source line: base, tax_code, rate, tax_amount, kind,
    inclusive flag) — the computed breakdown attached to invoices/bills/notes
- **ERP Tax Ledger**
  - `erp_tax_ledger` (legal_entity, period, direction output|input, tax_code, base, tax,
    reference_type, reference_id, status) — the returns/reconciliation source
- **ERP Country Compliance**
  - `erp_tax_submissions` (legal_entity, pack, **pack_version + schema_version (pinned, §2.1)**,
    document ref, payload ref, uuid/hash, signature ref, status lifecycle
    draft→generated→signed→submitted→cleared|rejected, authority response) — extends the
    existing ETA status concept generically; the pinned version makes reprints/amendments reproducible
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
| **5A — Global Tax Engine** | Pure engine + **legal-entity dimension (§3.1)** + **multi-registration (§3.2)** + **effective-dated codes/rules (§3.3)** + tax data model + ledger + generic VAT report + posting integration + audit. | Phase-1 poster (done). |
| **5B — Country Pack Framework** | `TaxCompliancePack` interface + registry + **pack-versioning + version pinning (§2.1)** + submission lifecycle model + secrets handling + health surface. | 5A. |
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
