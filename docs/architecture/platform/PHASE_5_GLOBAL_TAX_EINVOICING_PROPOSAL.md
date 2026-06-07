# VANTORA — Phase 5: Global Tax & E-Invoicing Framework (Architecture Proposal)

**Status:** 🧊 **APPROVED — FROZEN BASELINE (2026-06-07).** This document is the approved
Phase 5 architecture baseline; changes require a new architecture review. Implementation
proceeds against this baseline starting with Phase 5A (see
`docs/phases/PHASE_5A_IMPLEMENTATION_ROADMAP.md`). Formalizes and supersedes the earlier
backlog capture `COUNTRY_COMPLIANCE_EINVOICING_ARCHITECTURE.md` into a phased,
platform-wide framework. (Approved with rev-2 additions: §3.1 legal entity, §3.2 multiple
VAT registrations, §3.3 effective-dated tax rules, §2.1 country-pack versioning.)
**Classification:** Platform Foundation Capability · **Priority: High** (precedes
commercial onboarding in KSA/Egypt).
**Revision (rev 2):** expanded per review to explicitly cover the **legal-entity dimension
(§3.1)**, **multiple VAT registrations per company (§3.2)**, **effective-dated tax rules
(§3.3)**, and the **country-pack versioning strategy (§2.1)**.
**Revision (rev 3):** **document-level tax treatment (§1A)** — tax treatment is resolved
**per document**, not from customer master alone, so the same customer can receive mixed
tax/non-tax documents on the same day; adds the document-tax-profile catalog + treatment
resolution entities to the data model (§5) and country examples (§1A.5). _(Amendment to
the frozen baseline; design-only, pending review.)_
**Revision (rev 4):** **Tax Determination Rules Engine (§1B)** — automatically determines
the document tax profile + treatment from transaction inputs (no manual per-document
selection), with a deterministic rule priority, multi-tenant + effective-dated + pack-
versioned rules; adds `erp_tax_determination_rules` to the data model (§5) and a 5A
milestone (M4c). _(Amendment to the frozen baseline; design-only, pending review.)_

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

## 1A. Document-Level Tax Treatment (rev 3 — Phase 5A Core)

**Principle: tax treatment is a property of the DOCUMENT, not the customer.** A customer
is not "a tax customer" or "a non-tax customer"; the *same* customer can legitimately
receive a tax invoice, a non-tax invoice, a credit note, and a receipt **on the same
day**. The engine therefore resolves tax treatment **per document at creation time** and
**stamps it on the document** — it is never inferred solely from customer master data.

### 1A.1 Resolution hierarchy (cascade, most-specific wins)
```
Company → Legal Entity → Customer → Document Type → [Document Tax Treatment]
```
- A **default treatment** is configured at each level; resolution walks the chain and the
  **most specific match wins**, with a **per-document override** at creation (a user/flow
  may set the document's tax profile explicitly within what the legal entity/registration
  permits).
- The resolved treatment is **persisted on the document** (`document_tax_profile_id` +
  effective tax-point date) so it is immutable history — re-prints/credit-notes reuse it.
- This removes the "customer-level conflict": because treatment is per document, two
  documents for the same customer on the same day can carry different profiles **without
  any configuration change** — they simply resolve/override to different profiles.
- Effective-dating (§3.3) and registration selection (§3.2) still apply *given* the chosen
  profile (the profile decides *whether/how* tax applies; codes/rates decide the amounts).

### 1A.2 Document tax profiles (the supported set)
A platform catalog of **document tax profiles**, each with a tax behaviour + compliance
class the country packs key off:

| Profile | Taxable? | Notes |
|---------|----------|-------|
| Tax Invoice | yes (standard) | full tax invoice; e-invoice/clearance per pack |
| Simplified Tax Invoice | yes | B2C/POS simplified; QR per pack (e.g. ZATCA P1) |
| Non-Tax Invoice | no | commercial doc with no tax lines (out-of-scope/unregistered flow) |
| Credit Note | no-tax | adjustment without tax (mirrors a non-tax invoice) |
| Debit Note | no-tax | adjustment without tax |
| Tax Credit Note | yes | tax-bearing CN referencing a tax invoice; pack-reported |
| Tax Debit Note | yes | tax-bearing DN referencing a tax invoice; pack-reported |
| Receipt | no-tax | payment receipt, no tax |
| Tax Receipt | yes | tax-bearing receipt (e.g. ETA e-receipt for cash sales) |
| Out Of Scope | excluded | outside VAT scope; not reported as taxable |
| Zero Rated | yes @ 0% | reportable, inputs recoverable |
| Exempt | no tax | no tax, no input recovery |

Profiles map to the engine's tax **kind** (§1.1) + a **compliance class** (`e_invoice`,
`e_receipt`, `simplified`, `none`). The catalog is platform-owned; packs extend the
compliance mapping, never the customer master.

### 1A.3 Mixed tax/non-tax documents, same customer, same day
Because the document carries its own profile:
- Customer C, on 2026-06-07, can receive: a **Tax Invoice** (14% VAT, ETA e-invoice), a
  **Non-Tax Invoice** (out-of-scope service), a **Tax Credit Note** (correcting an earlier
  tax invoice), and a **Receipt** — each resolved/overridden independently, each ledgered
  and (where taxable) submitted under its own profile. **No conflict, no per-customer
  toggle.**
- The tax ledger and reports filter by profile/kind, so non-tax and out-of-scope documents
  never pollute the VAT return; taxable profiles net correctly.

### 1A.4 Country packs key off the DOCUMENT profile (not customer master)
The `TaxCompliancePack` (§2) receives the **resolved document tax profile** and decides
compliance from it:
- profile → whether to generate an e-invoice / e-receipt / simplified doc, which schema,
  whether clearance vs reporting, which validations, and the statutory document type code.
- Customer master only contributes inputs to *resolution* (e.g. registered vs not); it is
  **never** the sole determinant of compliance. A pack reads `document_tax_profile` first.

### 1A.5 Country examples
- **Egypt (ETA):** `Tax Invoice` → ETA **e-invoice** (full, signed JSON, document type
  `I`); `Tax Receipt` → ETA **e-receipt** (B2C cash); `Non-Tax Invoice`/`Out Of Scope` →
  internal doc, **not** sent to ETA; `Tax Credit Note`/`Tax Debit Note` → ETA `C`/`D`
  referencing the original. Same customer can get an e-invoice and an internal non-tax
  invoice the same day — the pack acts only on the taxable profiles.
- **Saudi (ZATCA):** `Tax Invoice` (B2B) → **standard** invoice → **Clearance** (Phase 2,
  signed UBL XML + UUID/PIH); `Simplified Tax Invoice` (B2C) → **Reporting** + **QR**
  (Phase 1); `Tax Credit/Debit Note` → corresponding note cleared/reported; `Exempt`/`Zero
  Rated` carried with the correct category code. The B2B vs B2C clearance-vs-reporting
  split is driven by the **profile**, not the customer record.
- **UAE (FTA):** `Tax Invoice` (5% VAT) and `Simplified Tax Invoice` (B2C) reported on the
  VAT return; `Zero Rated` (e.g. exports) and `Exempt` (e.g. certain financial services)
  carried distinctly; `Out Of Scope` excluded. E-invoicing readiness keys off the profile
  when the FTA mandate activates.

---

## 1B. Tax Determination Rules Engine (rev 4 — Phase 5A Core)

**Objective:** eliminate manual tax-profile selection on every document. Given a
transaction context, the engine **automatically determines** the correct tax treatment
(the document tax profile of §1A and the codes/rates of §1). Manual override (§1A.1)
remains possible but is the exception, not the rule. Pure, deterministic, data-driven —
the same "rules are data, not code" pattern as the posting-rule engine.

### 1B.1 Determination inputs
A rule is matched against the transaction context:
`country`, `legal_entity`, `vat_registration`, `customer_type`, `customer_classification`,
`channel`, `document_type`, `product_tax_code`, `product_category`, `transaction_type`
(e.g. domestic/export/import/intra-GCC), and the **effective date** (tax point). Any input
may be a wildcard (rule applies regardless of that dimension).

### 1B.2 Determination outputs
A matched rule resolves:
`tax_profile` (one of the §1A.2 profiles) · `vat_treatment`
(standard/zero/exempt/out_of_scope/reverse_charge) · `tax_code` · `tax_rate` (or "from tax
code, as-of date") · `compliance_requirement` (`e_invoice|e_receipt|simplified|none`) ·
`country_pack` (which pack handles it) · `reporting_category` (the box/category on the
statutory return).

### 1B.3 Rule priority (deterministic)
When multiple rules match, the **most specific wins** via a fixed specificity order, with
an explicit numeric `priority` as the final tiebreaker:
```
Country → Legal Entity → VAT Registration → Document Type → Customer Type
       → Customer Classification → Channel → Product Tax Code → Product Category
       → Transaction Type   (then explicit priority, then rule id for total order)
```
- Specificity is scored (a non-wildcard match on a higher dimension outranks lower ones),
  so determination is **deterministic and explainable** (the engine returns *which* rule
  fired + why — an audit/debug "trace").
- A platform **default rule set** ships per country pack (sensible statutory defaults);
  per-company rules override (multi-tenant, §1B.5).

### 1B.4 Country examples
| Context | Determined output |
|---------|-------------------|
| Saudi · Retail/B2C customer · Sales Invoice | **Simplified Tax Invoice** · standard 15% · ZATCA **reporting** + QR |
| Saudi · B2B customer (registered) · Sales Invoice | **Standard Tax Invoice** · standard 15% · ZATCA **clearance** (signed XML) |
| Any GCC · Export transaction | **Zero Rated** (0%) · reporting category "exports" |
| Any · Out-of-scope transaction | **Non-Tax Document** · `out_of_scope` · no submission |
| Egypt · B2B · Sales Invoice | **Tax Invoice** 14% · ETA **e-invoice** (type `I`) |
| Egypt · B2C cash · POS sale | **Tax Receipt** · ETA **e-receipt** |
| UAE · B2C · Sales Invoice | **Simplified Tax Invoice** 5% · FTA reporting |
| UAE · designated-zone/export | **Zero Rated** · reporting category per FTA |

### 1B.5 Multi-tenant
Rules are **per company** (and may target a legal entity/registration), RLS-scoped;
editing one tenant's rules never affects another. Platform/pack defaults (company_id NULL)
are overridden by company rows — same override model as posting rules.

### 1B.6 Effective-dated & versioned
- Each rule is **effective-dated** (`effective_from/to`); determination uses the rule set
  **as-of the document tax point** (§3.3), so a future VAT-rate change is a new rule row
  and historical transactions are untouched.
- Rules carry a **`pack_version`** binding (§2.1), so a regulatory change ships as a new
  pack version + rule set, adopted per tenant on its effective date — no edits to live rules.

### 1B.7 How it fits
Determination runs **before** computation: `determine(ctx, asOf) → {profile, treatment,
tax_code, rate, compliance, pack, reporting_category}` → the document is stamped with the
profile (§1A) → `computeTax` (§1.2) produces the amounts → the ledger/report tag the
reporting_category → the resolved pack handles compliance. Pure resolver; fully testable
before any DB.

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
- **ERP Document Tax Treatment (rev 3 — §1A)**
  - `erp_document_tax_profiles` (code, name, tax_kind `standard|zero|exempt|out_of_scope|none`,
    compliance_class `e_invoice|e_receipt|simplified|none`, is_taxable, is_note,
    requires_original_ref) — platform catalog of the 12 profiles (Tax Invoice, Simplified
    Tax Invoice, Non-Tax Invoice, Credit Note, Debit Note, Tax Credit Note, Tax Debit Note,
    Receipt, Tax Receipt, Out Of Scope, Zero Rated, Exempt).
  - `erp_document_tax_treatments` (scope_level `company|legal_entity|customer|document_type`,
    scope_id, document_type, document_tax_profile_id, is_default, **effective_from/to**) —
    the **cascade resolution** rows (Company → Legal Entity → Customer → Document Type);
    most-specific wins; per-document override permitted within the registration's allowed set.
  - **Document stamp:** sales/AR/note documents carry `document_tax_profile_id` (+ resolved
    tax-point date) — the immutable per-document treatment (additive nullable column on the
    existing document tables; resolved at creation, never from customer master alone).
  - `erp_tax_determination_rules` (rev 4 — §1B): company_id (NULL = platform/pack default),
    match inputs (country, legal_entity_id, vat_registration_id, customer_type,
    customer_classification, channel, document_type, product_tax_code, product_category,
    transaction_type — each nullable = wildcard), **outputs** (document_tax_profile_id,
    vat_treatment, tax_code, tax_rate_source, compliance_requirement, country_pack,
    reporting_category), `priority`, **`effective_from/to`**, **`pack_version`**, is_active.
    Determination = most-specific-match as-of tax point (§1B.3); the fired rule id is
    recorded on the document for audit/explainability.
- **ERP Tax Transactions**
  - `erp_tax_document_lines` (per source line: base, tax_code, rate, tax_amount, kind,
    inclusive flag, **document_tax_profile_id**) — the computed breakdown attached to
    invoices/bills/notes, tagged with the resolved document profile
- **ERP Tax Ledger**
  - `erp_tax_ledger` (legal_entity, registration, period, direction output|input, tax_code,
    base, tax, **document_tax_profile_id**, reference_type, reference_id, status) — the
    returns/reconciliation source; profile lets non-tax/out-of-scope docs be excluded from
    the VAT return cleanly
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
| **5A — Global Tax Engine** | Pure engine + **document-tax-profile catalog + treatment resolution (§1A)** + **tax determination rules engine (§1B)** + **legal-entity dimension (§3.1)** + **multi-registration (§3.2)** + **effective-dated codes/rules (§3.3)** + tax data model + ledger + generic VAT report + posting integration + audit. | Phase-1 poster (done). |
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
