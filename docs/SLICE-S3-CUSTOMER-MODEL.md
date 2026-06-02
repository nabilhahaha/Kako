# Slice S3 — Expanded Customer Model — Design Review

> **Design for approval — no build yet.** Adds the FMCG + ERP-integration customer
> fields (owner decision 3) to `erp_customers`. Builds on S1 (regions/areas) for
> the geo links. Additive + idempotent; nullable/defaulted → **zero regression**;
> existing customers unaffected; protected verticals untouched.

---

## 1. Requested fields → current vs. new (grounded)
`erp_customers` today has: `code, name, name_ar, phone, email, address, city,
tax_number, credit_limit, balance, branch_id, route_id, salesman_id, visit_day,
is_approved, external_id, custom (jsonb), company_id`.

| # | Requested field | Status | Mapping / plan |
|---|---|---|---|
| 1 | Customer Code | ✅ exists | `code` |
| 2 | Customer Name | ✅ exists | `name` (+ `name_ar`) |
| 3 | Branch | ✅ exists | `branch_id` |
| 4 | Region | ➕ new | `region_id` → `erp_regions` (from S1) |
| 5 | Area | ➕ new | `area_id` → `erp_areas` (from S1) |
| 6 | Route | ✅ exists | `route_id` |
| 7 | Sales Rep | ✅ exists | `salesman_id` |
| 8 | Channel | ➕ new | `channel` text (traditional/modern/horeca/wholesale) |
| 9 | Classification | ➕ new | `classification` text (`A`/`B`/`C`) + `segment` text (retail/wholesale/key_account/discount) |
| 10 | CR Number | ➕ new | `cr_number` text (commercial registration) |
| 11 | VAT Number | ◑ partial | reuse existing `tax_number` as VAT, OR add explicit `vat_number`; **recommend add `vat_number`** and keep `tax_number` for legacy (decision §6.1) |
| 12 | National Address | ➕ new | `national_address` text (KSA national address) |
| 13 | GPS Location | ➕ new | `latitude` numeric + `longitude` numeric |
| 14 | Phone | ✅ exists | `phone` |
| 15 | Email | ✅ exists | `email` |
| 16 | Contact Person | ➕ new | `contact_person` text (+ `contact_phone` optional) |
| 17 | Credit Limit | ✅ exists | `credit_limit` |
| 18 | Payment Terms | ➕ new | `payment_terms_days` int (e.g. 0/15/30/60) |
| 19 | Status | ◑ partial | `is_active` exists implicitly; add explicit `status` text (active/inactive/blocked) OR reuse `is_active`+`is_approved`; **recommend add `status`** (decision §6.2) |

**New columns to add (migration 0103):** `region_id`, `area_id`, `channel`,
`segment`, `classification`, `cr_number`, `vat_number`, `national_address`,
`latitude`, `longitude`, `contact_person`, `contact_phone`, `payment_terms_days`,
`status`. All nullable / defaulted → existing rows unaffected.

## 2. Migration 0103 (additive + idempotent)
- `ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS …` for each new field
  (nullable; `status` defaults `'active'`; `payment_terms_days` nullable).
- FKs: `region_id → erp_regions(id) ON DELETE SET NULL`, `area_id → erp_areas(id)
  ON DELETE SET NULL` (consistent with branch links in S1).
- Indexes on `region_id`, `area_id`, `classification`, `segment` (for dashboard
  slicing/filters).
- **No RLS change** (erp_customers already company-scoped). No data backfill.

## 3. App layer
- **Types:** extend `Customer` interface with the new fields.
- **Entity registry:** add the new fields to the `customer` field map → **import/
  export/API pick them up automatically** (key for ERP coexistence + bulk load).
- **Customers form (create/edit):** add inputs — Region + Area selectors
  (cascading: Area filtered by Region), Channel + Segment + Classification
  selects, CR/VAT/National Address/Contact text, GPS (lat/lng), Payment Terms,
  Status. Group sensibly (Identity · Geography · Commercial · Compliance/ERP).
- **Customers list:** add Segment + Classification badges + filters (the dashboard
  value).
- **i18n:** new keys (ar/en parity).

## 4. ERP-integration alignment
These map directly to ERP customer objects (improves the coexistence story):
- `external_ref`/`external_id` (have) + `cr_number` + `vat_number` →
  NetSuite/SAP/Dynamics/Odoo customer identifiers & tax fields.
- `segment`/`channel`/`classification`/`payment_terms_days` → standard ERP
  customer attributes (terms, price group, category).
- (Adapter **field-map presets** to these are a later per-pilot follow-up — S3
  just provides the columns + entity-map so sync/import can use them.)

## 5. Scope discipline / no-regression
- Purely **additive columns** + form fields + entity-map entries. No existing
  column changed, no data migrated, no RLS change. Existing customers keep working
  (new fields NULL/'active'). Protected verticals unaffected. **Region/Area
  assignment is optional** — non-FMCG tenants simply leave them blank.
- **No hierarchy scope here** (that's S4); customers gain geo *fields*, but who can
  *see* which customers by region/area is still S4.

## 6. Decisions to confirm (S3)
1. **VAT:** add explicit **`vat_number`** (keep `tax_number` legacy) vs. reuse
   `tax_number`? *(Recommended: add `vat_number` — clearer for ERP/KSA.)*
2. **Status:** add explicit **`status`** (active/inactive/blocked) vs. reuse
   `is_active`/`is_approved`? *(Recommended: add `status` — matches the request;
   keep `is_active` working.)*
3. **Segment vs Classification:** keep **both** (`segment` = retail/wholesale/key/
   discount; `classification` = A/B/C) — they're different axes? *(Recommended:
   both.)*
4. **Channel values:** traditional / modern / horeca / wholesale — confirm or
   adjust the allowed set.
5. **Migration number `0103`** (next free) — confirm.

*(S3 design — paused for your review + §6 decisions. On approval I build the
columns + types + entity-map + Customers form/list + i18n → tsc/test/build →
rolled-back live verification (0 existing customers changed, 0 residue) → draft
PR → review package → your approval to apply 0103 + merge. Then S4 — hierarchy
scope + RLS, the substantive visibility slice.)*
