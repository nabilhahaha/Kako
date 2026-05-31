# VANTORA — UI Alignment Review: Company Creation & Subscription screens

> **Review/plan for approval — no UI is built or deleted here.** Aligns the
> existing company-creation and subscription screens with the licensing model
> (`LICENSING-ARCHITECTURE.md` R4). **Constraint: do not delete the Companies &
> Subscriptions screens — refactor labels, grouping, and defaults only.**

---

## 1. Screens in scope (all kept; relabel/regroup/defaults only)
- **Setup Wizard** — `src/app/setup/setup-wizard.tsx` (business-type profile →
  module toggles → review).
- **App Marketplace** — `src/app/(app)/settings/marketplace/marketplace-manager.tsx`
  (today: a flat grid over `ALL_MODULES`).
- **Platform → Companies** (create/manage) —
  `src/app/(app)/platform/companies/*`.
- **Platform → Billing / Subscriptions** —
  `src/app/(app)/platform/billing/*` (plans, price book, subscribe).
- **Register / self-serve company creation** — `src/app/(auth)/register/*`.

## 2. Current state → gap
- Modules are shown as **one flat list** mixing capabilities (sales, inventory,
  accounting, purchasing, pos) and verticals (clinic, pharmacy, restaurant,
  salon, laundry, market, wholesale, distribution, hotel) — `ALL_MODULES` /
  `MODULE_LABELS` in `navigation.ts`.
- Business type drives a **profile** (`moduleToggles` with `defaultOn`) — i.e. it
  already *preselects* modules, which matches the target intent.
- **Gap:** the UI doesn't yet separate **Core Modules** from **Industry Packs**,
  and there's no explicit *capability* layer (CRM / Workflow / Analytics / Field
  Ops / Integrations) distinct from verticals.

## 3. Target UI structure (three groups)

### 3.1 Core Modules (capabilities — independently licensable)
**CRM · Sales · Inventory · Purchasing · Finance / Accounting · POS · Workflow &
Approvals · Analytics · Field Operations · Integrations.**
- Shown as a grouped section ("Core Modules") with per-module toggle + short
  description + entitlement state (included in plan / add-on / enabled).

### 3.2 Industry Packs / Business Templates
**Clinic · Pharmacy · Distribution · Retail · Restaurant / Café · Hotel · Salon ·
Laundry · Electrical Retail & Wholesale.**
- Shown as a separate "Industry Packs" section. Selecting a pack **preselects**
  its recommended Core Modules + pack-specific features (e.g. Pharmacy → Sales +
  Inventory + POS + dispensing/**Egyptian Drug List**; Electrical → POS +
  Inventory + Purchasing + multi-tier pricing + warranty + serials).
- A pack is an **add-on bundle on top of Core Modules**, never a separate product.

### 3.3 Roles
- Remain **configurable**, and are **suggested** based on the selected Core
  Modules + Industry Pack (the wizard already previews roles). E.g. selecting
  Field Operations suggests "Sales Rep / Supervisor"; Clinic suggests
  "Reception / Doctor"; POS suggests "Cashier".
- Suggested → editable; nothing is forced.

## 4. Business Type behavior (unchanged role, clarified)
Business Type **stays** but is **only a preselector**: it sets recommended Core
Modules + the matching Industry Pack + suggested roles as **defaults**. It does
**not** gate or replace module licensing — the customer can add/remove any Core
Module à-la-carte regardless of business type.

## 5. Per-screen refactor (labels/grouping/defaults only)
- **Setup Wizard:** split the single "Required modules" step into **Core Modules**
  + **Industry Pack** sub-sections; business-type profile seeds defaults; roles
  preview becomes "suggested roles (editable)". No flow removed.
- **Marketplace:** replace the flat `ALL_MODULES` grid with two grouped sections
  (Core Modules / Industry Packs); same toggle mechanism + entitlement gating;
  no items removed (wholesale/market relabel into Retail/POS + pack pricing).
- **Platform → Companies (create):** when creating a company, present Business
  Type (preselect) → Core Modules + Pack (defaults) → plan; same data, regrouped.
- **Platform → Billing/Subscriptions:** label plans as convenience bundles over
  Core Modules; show **Industry Packs** and **Integrations** as add-ons (R4);
  price book unchanged structurally.
- **Register:** business type + company name unchanged; the post-register setup
  wizard carries the new grouping.

## 6. Data mapping (additive — no breakage, no deletions)
Current module keys map to the new groups (existing rows keep working; new
capability keys are **added**, verticals become packs):

| Current key(s) | New group / item |
|---|---|
| `sales` | Core: **Sales** |
| `inventory`, `warehousing` | Core: **Inventory** |
| `purchasing` | Core: **Purchasing** |
| `accounting` | Core: **Finance / Accounting** |
| `market`, `pos` | Core: **POS** |
| *(new)* `crm` | Core: **CRM** *(today under customers.manage)* |
| *(new)* `workflow` | Core: **Workflow & Approvals** |
| *(new)* `analytics` | Core: **Analytics** |
| *(new)* `field_ops` | Core: **Field Operations** *(today field.sales)* |
| *(new)* `integrations` | Core: **Integrations** |
| `clinic`,`pharmacy`,`restaurant`,`salon`,`laundry`,`hotel`,`distribution` | Industry Packs |
| `market`/supermarket | Pack: **Retail** |
| `wholesale` | folds into **Distribution** / **Electrical** pack pricing |
| *(new)* `electrical` | Pack: **Electrical Retail & Wholesale** |

This mapping is the UI's view of the R4 two-dimensional model; the **new keys +
labels are additive**, so existing companies/subscriptions are unaffected.

## 7. Dependencies & sequencing
- The **grouping + relabel + defaults** (Core vs Packs vs Roles) can land as a
  **UI-only refactor** now (presentation over the existing toggles), with the new
  capability keys (`crm`/`workflow`/`analytics`/`field_ops`/`integrations`)
  surfaced as they're formalized in the **R4 licensing build**.
- Full entitlement/billing wiring (add-on pricing, enforcement) is the **R4
  build** — this review only aligns the **screens**.
- No production DB change required for the relabel/regroup; new module keys arrive
  with R4 (additive migration there, not here).

## 8. Decisions to confirm (before the UI refactor build)
1. **Land the UI grouping now** (presentation refactor over existing modules,
   new capability items shown as "available with licensing") **or** wait for the
   R4 capability-key build so Core Modules are fully real first? *(Recommend:
   land grouping + labels now; wire new capability keys with R4.)*
2. **Pack ↔ Core preselect map** — confirm the recommended Core Modules per pack
   (draft in §3.2) so defaults are right.
3. **Roles suggestions** — confirm the suggested-role sets per module/pack (reuse
   the existing business-type role templates as the seed).
4. Keep **Business Type** as a labeled preselector (not hidden)? *(Recommended —
   familiar + drives good defaults.)*

*(UI Alignment Review — paused for your approval. Refactor is labels/grouping/
defaults only; Companies & Subscriptions screens are preserved.)*
