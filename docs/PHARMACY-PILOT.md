# Pharmacy Pilot — Discovery, Reuse Assessment & Build Plan

Tenant target: **Amty Pharmacy Demo** (to be created on `vantora-staging`).
Goal: a real-world-usable pharmacy module (Global Medicine Catalog → tenant
inventory → fast POS → batch/expiry control → roles → dashboard → reports).

## 1. Discovery — does the Egyptian medicine database exist?

**Yes — it exists as a reusable platform asset, and it is now loaded into
`vantora-staging`.** It was never a static repo file or a Supabase-storage
object; it is an on-demand importer of the open (CC0) **Egyptian Drug Database**
into a **global, trigram-indexed reference table**.

Where it lives:
- **Importer:** `src/app/(app)/clinic/reference-actions.ts → importEgyptianDrugs()`
  (platform-owner only) + UI at `/platform/drugs`. Source:
  `github.com/karem505/egyptian-drug-database` (`egyptian-drugs.csv`).
- **Global table:** `erp_clinic_reference` with `kind='drug'` (shared across all
  tenants, read by any signed-in user, write = platform owner). Trigram indexes
  on `name`, `name_ar`, `detail` (migration 0074).
- Git provenance: `1877274 feat(pharmacy): build the product catalog from the
  Egyptian drug list`, `df3eecc feat: pharmacy dispensing register … with FEFO`.

Checked and **negative** (no Egyptian medicine data found): Supabase storage
(buckets: visit-photos, near-expiry-photos, attachments), repo CSV/XLSX/JSON
(only FMCG onboarding templates), removed-file git history.

**Loaded now:** the full dataset was fetched server-side via `pg_net` (3.74 MB,
24,894 lines, HTTP 200, untruncated) and parsed into the global catalog:
**24,860 drugs** with Arabic name, active ingredient, manufacturer, drug class,
form and price (8 quoted-comma rows skipped = 0.03%). The dataset is richer than
the old importer read (it also has `manufacturer`, `drug_class`, `route`), so the
catalog schema was extended (0274) and `importEgyptianDrugs()` upgraded to keep
that fidelity on future re-imports.

## 2. Reuse classification

| Asset | Classification | Note |
|---|---|---|
| `erp_clinic_reference (kind='drug')` + trigram indexes | **Reusable as-is** (now populated, 24.9k) | The Global Medicine Catalog. |
| `importEgyptianDrugs()` importer + `/platform/drugs` UI | **Reusable with modification** (done) | Now stores manufacturer/class/form. |
| `searchClinicalReference()` | **Reusable as-is** | Drug autocomplete (ilike + trigram). |
| `products/drug-catalog-picker.tsx` + `addDrugsToProducts()` | **Reusable as-is** | Onboard tenant inventory FROM the catalog. |
| `erp_products_catalog` (barcode/code/brand/pack/expiry_days/uom) | **Reusable with modification** | Now linked via `medicine_ref_id`, `is_medicine`; + trigram indexes for POS. |
| `erp_pharmacy_dispenses` / `_items` (+ `is_controlled`, batch/expiry on lines) | **Reusable as-is** | Rx dispensing register. |
| `erp_product_fefo_batch()` (FEFO hint from goods-receipt) | **Reusable with modification** | Superseded by batch-model FEFO (`erp_pick_fefo_batches`). |
| `sales/pos` terminal | **Reusable with modification** | Base for the fast pharmacy POS (add batch/FEFO/hold-resume). |
| `/cashbox` + `erp_cash_sessions` (shift/handover) | **Reusable as-is** | Cashier shift + Z-report. |
| Critical Actions + `erp_action_policies` + audit + notifications | **Reusable as-is** | Governs stock adjust / write-off / returns. |
| `near-expiry-photos` storage bucket | **Reusable as-is** | Evidence capture for write-offs. |
| `near_expiry_records` (empty 2-col stub) | **Obsolete** | Replaced by `erp_expiry_risk` view. |
| Batch-level stock, FEFO sales, expiry buckets, write-off | **Missing → built (0274)** | New `erp_product_batches` + `erp_pick_fefo_batches` + `erp_expiry_risk`. |

## 3. Architecture (FMCG-first, reusable across healthcare verticals)

```
Global Medicine Catalog        erp_clinic_reference(kind='drug')   ← shared, 24.9k
  (definitions: en/ar/generic/active/mfr/strength/form/class/barcode/aliases)
        │ medicine_ref_id
        ▼
Tenant Inventory Definition    erp_products_catalog (is_medicine, price, tax, min_stock)
        │ product_id
        ▼
Batch / Lot / Expiry Stock     erp_product_batches (qty, batch, lot, expiry, cost, supplier)
        │ FEFO
        ▼
POS / Dispense / Returns       erp_invoices · erp_pharmacy_dispenses · returns
Expiry control                 erp_expiry_risk view + write-off (Critical Action)
```

Onboarding (no manual entry of thousands): (1) pick from Global Catalog →
`addDrugsToProducts`, (2) Excel import (existing import engine), (3) mixed.

## 4. Keystone delivered (migration 0274)

- Global catalog enriched: `generic_name, active_ingredient, manufacturer,
  strength, form, category, barcode, internal_code, aliases` (+ barcode index).
- `erp_products_catalog`: `medicine_ref_id`, `is_medicine`, **trigram GIN indexes
  on `name`/`name_ar`** (instant POS partial search).
- `erp_product_batches` (tenant-scoped, RLS) — batch/lot/expiry stock, FEFO +
  expiry + per-warehouse indexes, natural-key uniqueness.
- `erp_pick_fefo_batches(product, warehouse, qty)` — FEFO allocation for POS.
- `erp_expiry_risk` view — expired / ≤30 / ≤60 / ≤90-day buckets (RLS-aware).

## 4b. Tenant Feature Configuration (built — 0275)

Pharmacy capabilities are **per-tenant configurable, never hard-coded**. A
generic, reusable layer (pharmacy is the first `pack`; other industries add
features with a new pack):

- **Catalog** `src/lib/erp/feature-catalog.ts` — 20 features across Inventory /
  POS / Governance, each with templates + a `coverage` map (nav/screen/
  validation/logic).
- **Templates** — Pharmacy **Lite ⊆ Standard ⊆ Enterprise** (monotonic, tested).
- **DB** `erp_feature_flags` (RLS: read = tenant, write = company admin) +
  `erp_feature_enabled(company, key)` for SQL business logic.
- **Resolver** `src/lib/erp/feature-flags.ts` (`getFeatureFlags` — override row,
  else Lite default).
- **Screen** `/settings/features` (company admin) — apply a template + per-feature
  toggles; disabled features leave no UI/nav orphan.
- **Gating** — nav uses the existing `flag`/`enabledFlags` mechanism (layout
  injects the tenant's enabled feature keys); screens/validation/logic call
  `loadFeatureFlags()` / `getFeatureFlags` / `erp_feature_enabled`.

Validated on staging (rolled back): admin resolves batch=ON, FEFO=OFF, lot=OFF;
reads own 20 flags; non-admin write denied. Persisted demo config (Amty spec) on
City Care Pharmacy: batch/expiry/near-expiry/barcode-scan/hold-resume ON;
lot/FEFO/expiry-write-off/controlled OFF.

### UI Coverage Audit hook
Each feature's `coverage` (nav/screens/validation/logic) is the audit target.
`feature-catalog.test.ts` already enforces every feature declares coverage; the
forthcoming UI Coverage Audit cross-checks that an **enabled** feature is actually
rendered/usable on its declared screens and hidden when disabled.

## 5. Build plan (remaining phases)

1. **Catalog/onboarding services + UI** — search API over the 24.9k catalog
   (name/ar/generic/barcode/code), add-to-inventory, Excel import, batch intake
   (goods receipt → `erp_product_batches`).
2. **Fast Pharmacy POS** — keyboard-first, barcode + trigram search, FEFO batch
   pick, qty edit, hold/resume, cash + receipt print, returns (batch-aware).
3. **Inventory control** — near-expiry/expired alerts, dead-stock, stock
   adjustment + expiry write-off (Critical Action: irreversible + reason + audit
   + notify, via action policies).
4. **Roles** — Pharmacy Owner / Pharmacist / Cashier / Inventory Manager.
5. **Owner dashboard** — daily sales, cash, GP estimate, top meds, low stock,
   near/expired, returns, adjustments, sales by user.
6. **Reports** — daily sales, by medicine, inventory balance, low stock, near
   expiry, expired, dead stock, batch movement, cash session, returns, GP.
7. **Amty Pharmacy Demo tenant** — owner + pharmacist + 2 cashiers, sample
   inventory drawn from the Global Catalog, batches with varied expiries.
8. **Performance & pilot hardening** — pagination, index review, tenant-safe
   queries; load/QA.
