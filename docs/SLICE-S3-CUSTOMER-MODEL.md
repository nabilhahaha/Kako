# Slice S3 — Expanded Customer Model — Design Review

> **Design for approval — no build yet.** Adds the FMCG/ERP customer attributes
> from locked **decision 3**, building on S1's Region/Area entities. **Additive +
> idempotent** (`ADD COLUMN IF NOT EXISTS`, all nullable/defaulted → zero
> regression); no RLS change (inherits `erp_customers`); protected verticals
> untouched. The **data scope** that limits which customers a hierarchy level sees
> is **S4**, not here.

---

## 1. Goal (from locked decision 3)
Customer fields: *code, name, branch, region, area, route, sales rep, channel,
classification, CR number, VAT number, national address, GPS, phone, email,
contact person, credit limit, payment terms, status.* S3 makes `erp_customers`
carry the FMCG **segmentation + geo + commercial** attributes, wired into the
form, list filters, and entity registry (import/export/API).

## 2. Grounding — what `erp_customers` already has
Compiled from migrations 0005 / 0012 / 0015 / 0019 / 0060 / 0062 / 0079 / 0087:

| Already present | Source | Covers decision-3 field |
|---|---|---|
| `code`, `name`, `name_ar` | 0005 | code, name |
| `phone`, `email`, `address`, `city` | 0005 | phone, email |
| `tax_number` | 0005 | **VAT number** (reuse — no new `vat_number`) |
| `credit_limit`, `balance` | 0005 | credit limit |
| `branch_id` → `erp_branches` | 0005 | branch |
| `is_active` (+ `is_approved`) | 0005 / 0015 | **status** (reuse — no new `status` col) |
| `salesman_id` → `auth.users` | 0012 | sales rep |
| `visit_day` | 0012 | (visit scheduling) |
| `company_id` | 0019 | tenant scope |
| `route_id` → `erp_routes` | 0062 | route |
| `external_id` (+ unique per tenant) | 0079 | **ERP coexistence id** (reuse) |
| `custom` JSONB + custom-fields engine | 0087 | tenant-defined extras |
| price tier via `erp_wholesale_customer_tier(customer_id→tier_id)` | 0060 | **price group** (link table already exists) |
| **S1:** `erp_regions`, `erp_areas`, `erp_branches.region_id/area_id` | 0101 | region, area (entities exist; customer not yet linked) |

**So the genuinely-missing fields are:** segment, class (A/B/C), channel,
region/area link **on the customer**, GPS (lat/long), payment terms, contact
person/phone, CR number, national address. Everything else is **reuse**.

## 3. Proposed additive columns (migration 0103 — next free number after 0102)
All `ADD COLUMN IF NOT EXISTS`, nullable, no default that rewrites rows:

| New column | Type | Purpose / ERP mapping |
|---|---|---|
| `segment` | text | FMCG customer type: `retail`/`wholesale`/`key_account`/`distributor` |
| `classification` | text | ABC value class: `A`/`B`/`C` |
| `channel` | text | trade channel: `traditional`/`modern`/`horeca`/`wholesale` |
| `region_id` | uuid → `erp_regions` ON DELETE SET NULL | geo grouping (S1 entity) |
| `area_id` | uuid → `erp_areas` ON DELETE SET NULL | geo grouping (S1 entity) |
| `latitude` | numeric(9,6) | GPS — visit mapping / route optimization |
| `longitude` | numeric(9,6) | GPS |
| `payment_terms_days` | int | AR terms (common ERP customer attribute) |
| `contact_person` | text | FMCG ordering contact |
| `contact_phone` | text | ordering contact phone (distinct from `phone`) |
| `cr_number` | text | Commercial Registration no. (KSA), distinct from VAT/`tax_number` |
| `national_address` | text | KSA National Address (short address) |

Indexes (all `IF NOT EXISTS`): `idx_erp_customers_region`, `_area`,
`_segment`, `_channel` (filters/lookups). FK indexes on `region_id`/`area_id`.

> `segment`/`classification`/`channel` are stored as **text with app-layer
> validation** (the same free-text-union pattern the platform already uses for
> `erp_user_branches.role`) — **no DB enum/CHECK**, so future values are additive
> with no enum migration. See Decision 3.

## 4. Reconciliation — every decision-3 field accounted for (nothing dropped/duplicated)
| Decision-3 field | Handling |
|---|---|
| code, name, branch, route, sales rep, phone, email, credit limit | **exist** — reuse |
| VAT number | **reuse** `tax_number` (no new column) |
| status | **reuse** `is_active`/`is_approved` (no new column) |
| ERP id | **reuse** `external_id` (no new `external_ref`) |
| price group | **reuse** `erp_wholesale_customer_tier` (Decision 1) |
| region, area | **new FKs** `region_id`/`area_id` → S1 entities |
| channel, segment, classification | **new** text columns |
| CR number, national address | **new** `cr_number`, `national_address` |
| GPS | **new** `latitude`/`longitude` |
| contact person, payment terms | **new** `contact_person`/`contact_phone`, `payment_terms_days` |

## 5. App layer (after columns land)
- **`src/lib/erp/types.ts`** — extend `ErpCustomer` with the new optional fields.
- **`src/lib/erp/entities.ts`** — add the new fields to the `customer` descriptor
  `fields[]` so import/export/API pick them up automatically (label ar/en each).
- **`customers-manager.tsx`** — add form inputs (segment/class/channel selects;
  region/area selects sourced from `erp_regions`/`erp_areas`; GPS, contact,
  payment-terms, CR, national-address text); add **segment/class/channel filters**
  + region/area filter on the list; optionally a class badge column.
- **`customers/actions.ts`** — include new fields in `upsertCustomer` payload and
  the `select` lists; bulk-import maps them via the entity registry.
- **i18n** — extend `src/lib/i18n/messages/customers.ts` (ar + en parity) with the
  new field labels and filter strings.

## 6. Existing-tenant safety (core concern)
- Purely **additive nullable columns** → **zero** change to any existing customer
  row; no backfill; no RLS change (inherits `erp_customers` tenant policy).
- FKs are `ON DELETE SET NULL` (consistent with `branch_id`/`route_id`).
- Non-FMCG / protected verticals: the columns simply stay null — **no behaviour
  change**; form additions are optional inputs.

## 7. Verification plan (when built)
- **Rolled-back live** (staging/prod project, then rollback): all 12 columns +
  indexes present; **0 existing customer rows changed**; a functional insert
  setting region_id/area_id/segment/class/channel/GPS succeeds; `0 residue` after
  rollback; advisors 0 ERROR.
- `tsc` clean · full unit suite green (+ tests: registry exposes new fields; type
  shape; i18n ar/en parity) · `next build` clean.
- **Migration 0103 NOT applied to production** — held for approval.

## 8. Scope discipline
S3 = **customer fields + form/filter/registry wiring only.** No hierarchy
visibility/RLS-by-ownership (that's **S4**), no new roles (S2 ✅), no promotions
(S5). Region/Area **entities** came from S1; S3 only **links customers** to them.

## 9. Decisions to confirm (S3)
1. **Price group** — **reuse the existing `erp_wholesale_customer_tier` link**
   (recommended; already drives pricing) vs add a denormalized `price_group_id`
   on `erp_customers`? *(Recommend reuse — no duplicate source of truth.)*
2. **Region/Area** — link customers via **FKs to `erp_regions`/`erp_areas`**
   (recommended; S1 entities) vs light free-text `region`/`area`?
3. **Enumerated fields** — confirm the value sets and store `segment` /
   `classification` / `channel` as **text + app validation** (recommended; no enum
   migration) vs DB `CHECK`/enum. Confirm value lists:
   segment `retail|wholesale|key_account|distributor`, class `A|B|C`,
   channel `traditional|modern|horeca|wholesale`.
4. **VAT / CR** — confirm `tax_number` = **VAT** (reuse) and add a separate
   `cr_number` (Commercial Registration) + `national_address`? *(Recommend yes.)*
5. **ERP id** — **reuse existing `external_id`** (recommended) — do **not** add a
   second `external_ref`?
6. **Reconfirm scope** — S3 = customer fields only; visibility/scope by hierarchy
   is **S4**.

*(S3 design — paused for your review + the §9 decisions, especially #1–#3. On
approval I build the columns → app wiring → tests → rolled-back-live verify →
draft PR → review package → your approval, holding migration 0103 from production
until you approve. Then S4 — hierarchy scope + RLS.)*
