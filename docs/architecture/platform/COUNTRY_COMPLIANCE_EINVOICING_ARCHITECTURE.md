# VANTORA — Country Compliance & E-Invoicing Foundation (Architecture & Backlog)

**Status:** Architecture & backlog capture only — **no code, no migrations, no
implementation.**
**Classification:** Platform Foundation Enhancement · **Priority: High.**
**Sequencing:** after the Finance/Inventory core foundations (now complete — see Phase 1
readiness report) and **before commercial onboarding in KSA / Egypt.**
**Discipline (non-negotiable, §7):** Finance core stays **country-agnostic** · connectors
consume **finalized** invoice/journal data only · **no change to posting logic** · flags
**OFF by default** · **additive-only** · generic provider registry, **no per-country
hardcoding**.

> **Purpose:** ready VANTORA for tax-authority integrations (Egypt ETA, KSA ZATCA, GCC
> VAT) **without redesigning the Finance core**. Compliance is a layer *downstream* of
> posting — it reads finalized documents and submits/serializes them; it never feeds
> back into how the GL posts.

---

## Reuse baseline (already on `main`)
- **Egypt ETA scaffolding exists:** `erp_company_eta_settings`, `erp_invoices_eta_status`
  — the Egypt pack **extends** these rather than rebuilding.
- **Provider-registry pattern** proven by Search OS, and reused by the Data Portability
  export-handler registry — the **compliance provider interface** follows the same shape
  (modules/countries register handlers; core stays generic).
- **`erp_audit_logs`** (audit), background **jobs/tick** (submission queue + retries),
  **RLS** (tenant isolation), and the **finalized** `erp_journal_entries` / `erp_invoices`
  as the read-only source of truth.

---

## 1. Country Compliance Layer
- A registry of **country-specific compliance providers**, selected by the company's
  **country / tax regime** (from the company tax profile, §5).
- **No hardcoding inside Finance core** — Finance emits/finalizes documents; the
  compliance layer (separate module) subscribes and acts. Mirrors the Search/export
  provider registry: a generic `ComplianceProvider` interface, one implementation per
  country pack, resolved at runtime by regime.
- **Future countries plug in** by registering a provider — no core redesign.

## 2. KSA Compliance Pack (ZATCA Phase 2)
- ZATCA Phase-2 readiness: **e-invoice XML** generation (UBL 2.1), **QR code**,
  **UUID + invoice hash (PIH chain)**, **digital signature / certificate** (CSID)
  handling, **Clearance/Reporting API** connector, **credit & debit notes**.
- Standard (B2B clearance) vs simplified (B2C reporting) flows behind the provider.

## 3. Egypt Compliance Pack (ETA)
- ETA **e-invoice** + **e-receipt** readiness; **JSON** document generation;
  **taxpayer / branch / activity-code** mapping; **item code / GS1 / EGS** code mapping;
  **digital signature**; **submission-status tracking**; **credit & debit notes**.
- **Extends** existing `erp_company_eta_settings` / `erp_invoices_eta_status`.

## 4. GCC Future Packs
- **UAE VAT** readiness; extensibility for **Kuwait / Qatar / Bahrain / Oman**;
  country-specific **VAT reporting**. Each is a provider + a reporting profile — added as
  data/handlers, not a redesign.

## 5. Data-model readiness (additive tables/columns — captured, not built)
- **Company tax profile** / **Branch tax profile** — regime, country, e-invoicing mode
  (sandbox/prod), registration details.
- **Tax registration number** (company + branch).
- **Invoice tax classification** (per document) and **Product tax category** (extends
  `erp_products_catalog.tax_rate`).
- **Customer tax profile** / **Supplier tax profile** (registration, exemptions).
- **E-invoice status lifecycle:** `draft → generated → signed → submitted →
  cleared/accepted | rejected → cancelled` (extends `erp_invoices_eta_status`).

## 6. Integration design
- **`ComplianceProvider` interface** — `generate(doc) → payload`, `sign(payload)`,
  `submit(payload) → ack`, `poll(ref) → status`, `note(credit|debit)`.
- **Submission queue** (reuse jobs/tick) with **retry/backoff**, **error logging**,
  **audit trail** (`erp_audit_logs`).
- **Sandbox vs production credentials** per company tax profile (secret storage; never
  in repo).
- **API health dashboard** — per-provider connectivity/status surface.

## 7. Safety rules (headline invariants)
1. Finance core remains **country-agnostic** — zero country logic in posting.
2. Connectors consume **finalized** invoice/journal data (read-only, downstream).
3. **No change to current posting logic** (Phase 1 Augment model untouched).
4. Feature flags **OFF by default** (`KAKO_COMPLIANCE`, `KAKO_ZATCA`, `KAKO_ETA`, …).
5. **Additive-only** migrations.

---

## Boundary with Finance (why this never touches posting)
```
Sales/Finance  ──finalize──▶  erp_invoices / erp_journal_entries  ──read──▶  Compliance layer
   (posts GL,                  (immutable source of truth)            (serialize, sign,
    country-agnostic)                                                  submit, track status)
```
The compliance layer is a **consumer**, never a producer, of accounting data.

## Backlog placement & phasing
Platform Foundation Enhancement, after core foundations, before KSA/Egypt onboarding.
Phased: (1) compliance layer + provider registry + tax-profile data model;
(2) Egypt ETA pack (extends existing settings); (3) KSA ZATCA Phase-2 pack;
(4) GCC packs + VAT reporting; (5) submission queue/retry + health dashboard.
Each flag-gated, pilot-tenant first.

## Open questions (for the future architecture-review pass)
1. Certificate/secret storage & rotation (CSID, ETA signing) — KMS vs Supabase vault.
2. Document immutability/versioning when a cleared invoice is later credited.
3. Mapping ownership: where GS1/EGS/activity codes live (product vs tax-category table).
4. Clock/serialization of the ZATCA PIH hash chain under concurrency.
5. Multi-branch submission identity (per-branch credentials vs company-level).

*Architecture & backlog capture only — no code, migrations, or implementation. A full
architecture-review pass precedes any build, after the core foundations.*
