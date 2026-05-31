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

## 8. Confirmed principles (approved)
1. **Clear three-way separation:** Core Modules · Industry Packs · Roles.
2. **Industry Packs (9):** Clinic · Pharmacy · Distribution · Retail · **Electrical
   Retail & Wholesale (first-class, not a custom option)** · Restaurant / Café ·
   Hotel · Salon · Laundry.
3. **Core Modules (10):** CRM · Sales · Inventory · Purchasing · Finance /
   Accounting · POS · Workflow & Approvals · Analytics · Field Operations ·
   Integrations.
4. **Business Type only pre-selects** recommended Core Modules + a Pack (defaults);
   never gates or replaces module licensing.
5. **Keep** the current company-creation & subscription screens — improve labels,
   grouping, defaults, and usability only.
6. **Roles suggested dynamically** from the selected Core Modules + Industry Pack;
   editable.
7. **Electrical Retail & Wholesale = first-class Industry Pack.**

### Build sequencing (recommended)
- **UI grouping + labels + defaults + usability** land as a presentation refactor
  over the existing toggles; the new capability keys (`crm`/`workflow`/`analytics`/
  `field_ops`/`integrations`) + Electrical pack are surfaced and wired with the
  **R4 licensing build**. No production DB change for the relabel/regroup itself.

---

## 9. Proposed screen layouts (wireframes)

### 9.1 Setup Wizard — module/pack step (after business-type questions)
```
 ┌───────────────────────────────────────────────────────────────┐
 │  Set up <Company>            Business type: [ Distribution ▾ ]  │  ← preselects
 │  ●━━●━━●━━○   (Questions → Modules → Roles → Review)            │
 ├───────────────────────────────────────────────────────────────┤
 │  INDUSTRY PACK  (pick one; bundles recommended modules)         │
 │  ┌─────────┐┌─────────┐┌──────────────────┐┌─────────┐         │
 │  │ Clinic  ││Pharmacy ││ Distribution ✓   ││ Retail  │  …       │
 │  └─────────┘└─────────┘└──────────────────┘└─────────┘         │
 │  ┌──────────────────────────┐┌──────────┐┌────────┐            │
 │  │ Electrical Retail & W/S  ││Restaurant││ Hotel  │  Salon  …   │
 │  └──────────────────────────┘└──────────┘└────────┘            │
 │                                                                 │
 │  CORE MODULES  (toggle; pack preselects recommended ✓)          │
 │  [✓] CRM        [✓] Sales      [✓] Inventory   [✓] Purchasing   │
 │  [ ] Finance    [ ] POS        [✓] Field Ops   [✓] Workflow     │
 │  [ ] Analytics  [✓] Integrations                                │
 │  each: name · 1-line desc · ⓘ entitlement (in plan / add-on)    │
 ├───────────────────────────────────────────────────────────────┤
 │                                   [ Back ]   [ Continue → ]     │
 └───────────────────────────────────────────────────────────────┘
```

### 9.2 Setup Wizard — suggested roles step (new, editable)
```
 │  SUGGESTED ROLES  (from your modules + pack — edit freely)      │
 │  • Admin                              [keep]                    │
 │  • Sales Rep        (Field Ops, Sales)[keep] [rename] [remove]  │
 │  • Supervisor       (Field Ops)       [keep]                    │
 │  • Accountant       (Finance)         [add]                     │
 │  + Add custom role                                              │
```

### 9.3 App Marketplace — grouped (was a flat grid)
```
 │  Marketplace — enable what your company uses                    │
 │  ── CORE MODULES ─────────────────────────────────────────────  │
 │  [CRM ✓] [Sales ✓] [Inventory ✓] [Purchasing] [Finance]        │
 │  [POS] [Workflow ✓] [Analytics] [Field Ops ✓] [Integrations ✓]  │
 │      each tile: icon · name · desc · toggle · entitlement chip   │
 │  ── INDUSTRY PACKS ───────────────────────────────────────────  │
 │  [Clinic] [Pharmacy] [Distribution ✓] [Retail]                  │
 │  [Electrical Retail & Wholesale] [Restaurant] [Hotel] [Salon]…  │
 │      pack tile: features list · "enabling adds: Sales, POS…"     │
```

### 9.4 Platform → Companies → Create company
```
 │  New company                                                    │
 │  Name [__________]  Country [SA ▾]  Currency [SAR ▾]            │
 │  Business type [ Electrical Retail & Wholesale ▾ ]  ← preselect  │
 │  ── Recommended setup (editable) ─────────────────────────────  │
 │  Industry Pack:  Electrical Retail & Wholesale  [change]        │
 │  Core Modules:   POS ✓ Inventory ✓ Purchasing ✓ Finance ✓       │
 │                  Sales ✓ CRM ✓ Analytics ▢ Field Ops ▢          │
 │  Plan:  [ Professional ▾ ]   (bundles core; packs/Integrations  │
 │                               as add-ons)                       │
 │                                   [ Create company ]            │
```

### 9.5 Platform → Billing / Subscriptions (labels regrouped)
```
 │  Subscription — <Company>                                       │
 │  Plan: Professional (convenience bundle over Core Modules)      │
 │  ── Included Core Modules ────────────────────────────────────  │
 │  CRM · Sales · Inventory · Purchasing · Finance · POS · Workflow │
 │  ── Add-ons ──────────────────────────────────────────────────  │
 │  [Industry Pack: Electrical R&W]  [Integrations]  [+ add]       │
 │  ── Price book (unchanged structurally) ──────────────────────  │
 │  currency × interval grid …                                     │
```

(Wireframes are layout intent, not final visuals; all use the existing design
system primitives — `SectionHeader`, `Card`, `Badge`, `Select`, token-driven.)

## 10. Decisions to confirm before the UI build
1. **Pack → Core preselect map** — confirm the recommended Core Modules per pack
   (draft in §3.2 / the wizard defaults) so the checkmarks are right per pack.
2. **Role suggestion sets** — confirm suggested roles per module/pack (seed from
   the existing business-type role templates).
3. **Sequencing** — land the **grouping/labels/usability** refactor now (over
   existing modules), with the new capability keys + Electrical pack wired in the
   **R4 build**? *(Recommended.)*

*(UI Alignment Review — finalized for approval. Refactor is labels/grouping/
defaults/usability only; Companies & Subscriptions screens are preserved;
Electrical Retail & Wholesale is a first-class Industry Pack.)*
