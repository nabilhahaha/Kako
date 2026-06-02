# Slice S3 — Expanded Customer Model — Design + Build

> **Owner decisions locked (below) — built on this branch.** Adds the decision-3
> FMCG/ERP customer attributes, building on S1 (regions/areas) + S2 (roles).
> **Additive + idempotent** (`ADD COLUMN IF NOT EXISTS`, all nullable → zero
> regression); no RLS change on `erp_customers`; protected verticals untouched.
> Hierarchy **scope/visibility** (which customers a level sees) remains **S4**.

---

## ✅ Locked owner decisions
1. **Price group** — reuse the existing `erp_wholesale_customer_tier` link (no
   `price_group_id`).
2. **Region / Area** — FK references to S1 `erp_regions` / `erp_areas` (not free text).
3. **Segment / Classification / Channel** — **company-managed master data**, not
   hard-coded platform enums. Each company can create / edit / disable / add its
   own values; the platform seeds default FMCG examples. (See §3.)
   - Default seed values — Segment: Retail · Wholesale · Key Account · Distributor.
     Classification: A · B · C. Channel: Traditional Trade · Modern Trade ·
     Wholesale · HoReCa · E-Commerce.
4. **VAT / CR** — reuse `tax_number` = VAT; add `cr_number` + `national_address`.
5. **ERP id** — reuse `external_id` (no second `external_ref`).
6. **Scope** — S3 = customer fields only; hierarchy visibility/RLS = S4.

## 1. Grounding — what `erp_customers` already had (reused, not duplicated)
`code/name/name_ar/phone/email/address/city`; `tax_number` (=VAT); `credit_limit`
/`balance`; `branch_id`; `salesman_id`; `visit_day`; `route_id`; `external_id`
(=ERP id); `is_active`/`is_approved` (=status); `custom` JSONB; price tier via
`erp_wholesale_customer_tier`. **Missing (added by S3):** segment / classification
/ channel, region/area links, GPS, payment terms, contact person/phone, CR number,
national address.

## 2. Migration 0103 (additive; next free number after 0102)
**New table — `erp_customer_lookups`** (company-managed master data):
`id, company_id, kind ∈ {segment,classification,channel} (CHECK), code, name,
name_ar, sort, is_active, …`, `UNIQUE(company_id, kind, code)`. RLS + company_id
trigger + updated_at — same pattern as `erp_regions` (0101). The **KINDS are
platform-fixed; the VALUES are tenant-managed.**

**New columns on `erp_customers`** (all nullable):
| Column | Type | Notes |
|---|---|---|
| `segment_id` / `classification_id` / `channel_id` | uuid → `erp_customer_lookups` ON DELETE SET NULL | company master data |
| `region_id` / `area_id` | uuid → `erp_regions` / `erp_areas` ON DELETE SET NULL | S1 entities |
| `latitude` / `longitude` | numeric(9,6) | GPS |
| `payment_terms_days` | int | AR terms |
| `contact_person` / `contact_phone` | text | ordering contact |
| `cr_number` | text | Commercial Registration (≠ VAT) |
| `national_address` | text | KSA National Address |

Indexes on the four FK ids + region/area. **Seeding:** `erp_seed_company_customer_lookups(company_id)`
inserts the default FMCG values idempotently (guarded on `code`); backfilled for
existing **wholesale/delivery** companies and seeded for new companies of those
types via a dedicated `AFTER INSERT ON erp_companies` trigger (the existing
roles/modules seed trigger is left untouched). Mirrors 0098's field-relevant
scoping; other companies start empty and add their own.

## 3. Why master data (not enums) — decision 3
A fixed platform enum can't be edited/extended per company. Storing the values in
`erp_customer_lookups` (FK from the customer) means: rename propagates via FK,
disable hides a value from pickers without touching existing rows, and each
company curates its own taxonomy across industries — while the **permission model
and the three KINDS stay platform-controlled.** Kind-correctness of a customer's
FK (e.g. `segment_id` points at a `segment` row) is enforced at the app layer (the
form's selects are kind-scoped); RLS guarantees same-company.

## 4. App layer (built)
- **Settings → Customer Data** (`/settings/customer-data`, gated `settings.custom_fields`):
  three-panel manager (Segment / Classification / Channel) — add value, edit
  labels, activate/deactivate. Nav item + `customerData` i18n namespace (ar/en).
  Server actions: `upsertCustomerLookup` (code immutable on edit → FK-safe),
  `toggleCustomerLookupActive`.
- **`ErpCustomer` type** + new `CustomerLookup` type / `CustomerLookupKind`.
- **Customers form** — segment/class/channel selects (from the company's active
  lookups), region/area selects (S1), and GPS / contact / payment-terms / CR /
  national-address inputs. **List** gains segment/class/channel **filters** and a
  **Segment / Class** column. `upsertCustomer` writes the new fields.
- **Entity registry** — scalar fields (`cr_number`, `national_address`,
  `contact_person`, `contact_phone`, `payment_terms_days`, `latitude`,
  `longitude`) added to the customer import/export map; FK master-data/geo fields
  are set via the form (like `branch_id`), not the import map.

## 5. Existing-tenant safety
Additive nullable columns → **0** existing customer rows change; no `erp_customers`
RLS change; FKs `ON DELETE SET NULL`. The new table is tenant-scoped (RLS). Seeding
only adds rows for FMCG-type companies and is idempotent. Non-FMCG/protected
verticals are unaffected (their columns stay null; no lookups seeded).

## 6. Verification
- `tsc` clean · unit suite **292 passed / 10 skipped** (added: registry exposes
  the S3 scalar fields) · `next build` clean (`/settings/customer-data` compiled).
- **Rolled-back-live** (staging/prod, then rollback) to run with the review:
  table + columns + indexes present; defaults seeded for an FMCG tenant; **0
  existing customer rows changed**; FK insert of segment/region works; `0 residue`
  after rollback. **Migration 0103 held from production** until approved.

## 7. Scope discipline
S3 = customer fields + their master data only. Hierarchy visibility/RLS-by-owner
= **S4**. Region/Area *entities* came from S1; promotions = S5.

## 8. Next
- **S4** — hierarchy scope + RLS (NSM→regions, Regional→areas, Area→branches,
  Branch→branch, Supervisor/Rep→routes/customers).
- **Proposed companion slice (role-label customization)** — company-configurable
  **display titles** over the platform-fixed role keys/permission templates (e.g.
  `salesman` → "Medical Rep"). Same master-data-over-fixed-keys pattern as §3.
  See `docs/SLICE-S3b-ROLE-LABELS.md` (design for review).
