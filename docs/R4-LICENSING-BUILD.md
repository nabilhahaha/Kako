# VANTORA — R4 Licensing Build: design (for review)

> Implements the approved **Module Licensing & Subscription Architecture**
> (`LICENSING-ARCHITECTURE.md`). **Design for approval — no build/apply yet.**
> Additive + idempotent; **no deletions; protected assets unchanged**
> (Clinic/Pharmacy/Egyptian Drug List/Distribution/Electrical, all migrations).
> Completing R4 unlocks the **deferred UI-alignment** pieces.

---

## 1. Goal
Make **Core (capability) Modules** first-class entitlements alongside **Industry
Packs**, so a company can be licensed à-la-carte (one module / several / a pack /
full platform), with Business Type only **preselecting** defaults.

## 2. Current state (grounded)
- Entitlement = `erp_plan_modules` (plan→module) ∩ `erp_business_type_modules`
  (type→module) ∩ `erp_company_modules` (company→module, `enabled`).
- `module` is a free-text key — today the **capability** keys present are
  `sales, inventory, purchasing, accounting, pos` (+ finer `warehousing`,
  `sales_orders`, `returns`), and the **vertical** keys are `clinic, pharmacy,
  restaurant, salon, laundry, market, wholesale, distribution, hotel`.
- **Missing capability keys:** `crm, workflow, analytics, field_ops,
  integrations` (these are real capabilities today gated only by *permission*,
  not by a licensable *module*). `finance` ≙ existing `accounting`.

## 3. Target model (additive)
Introduce the **Core Module keys** as licensable modules and keep verticals as
**packs**. Catalog→DB key mapping (from `licensing-catalog.ts`):

| Core Module (catalog) | DB module key | New? |
|---|---|---|
| Sales | `sales` | existing |
| Inventory | `inventory` (+`warehousing`) | existing |
| Purchasing | `purchasing` | existing |
| Finance / Accounting | `accounting` | existing (label = Finance/Accounting) |
| POS | `pos` | existing |
| **CRM** | `crm` | **new** |
| **Workflow & Approvals** | `workflow` | **new** |
| **Analytics** | `analytics` | **new** |
| **Field Operations** | `field_ops` | **new** |
| **Integrations** | `integrations` | **new** |

Packs = vertical keys (`clinic, pharmacy, distribution, market`→retail,
`electrical`(new), `restaurant, hotel, salon, laundry, wholesale`).

## 4. Migration `0095` (additive, idempotent)
1. **Register the new capability module keys** wherever modules are catalogued
   (no schema change — these tables are free-text; we **seed rows**).
2. **`erp_plan_modules` seed** — assign Core Modules to plans per the **module-
   per-tier matrix** (§6, decision). Maps `free/standard/pro/unlimited`.
3. **`erp_business_type_modules` seed** — for each business type, add its
   recommended Core Modules (from `PACK_CORE_PRESELECT`, `finance`→`accounting`).
4. **Backfill `erp_company_modules`** — for **existing** companies, enable the
   **always-available capabilities** they effectively already had (so **no tenant
   loses access**): `crm, workflow, analytics` for all; `field_ops` where
   `field.sales`/distribution applies; `integrations` left **off** by default
   (opt-in add-on). (Exact backfill = decision §6.)
5. No changes to permissions, verticals, or any existing row's meaning.

> The capability **enforcement** (nav/route/RPC gating) is the TS layer (§5); the
> migration only seeds the taxonomy + backfill.

## 5. App changes
- **`navigation.ts`** — add the new keys to `Module` + `ALL_MODULES` +
  `MODULE_LABELS` (so they appear in the grouped Marketplace + are gateable).
- **Entitlement helper** — one `moduleEntitled(ctx, moduleKey)` used by nav,
  route guards, and (where relevant) action guards; a disabled module degrades
  gracefully (hidden in nav; route → `/upgrade`).
- **Wire `licensing-catalog` → real keys** (`finance`↔`accounting`) so the
  Setup Wizard **pack→core auto-preselect** and **suggested roles** become live,
  and the Marketplace Core/Pack groups reflect real entitlements.
- **Unlocks deferred UI-alignment:** real capability entitlements, pack-keyed
  auto-preselect, inline-editable suggested roles, Platform→Companies/Subscription
  regroup.

## 6. Decisions to confirm (before building)
1. **Module-per-tier matrix** — proposed (à-la-carte still overrides):
   | Module | Free | Starter | Professional | Enterprise |
   |---|---|---|---|---|
   | CRM, Sales | ✓ | ✓ | ✓ | ✓ |
   | Inventory, Purchasing, Analytics(basic) | | ✓ | ✓ | ✓ |
   | Finance, POS, Workflow, Field Ops | | | ✓ | ✓ |
   | Integrations | | API only | API+webhooks+1 conn | full |
   *(Confirm or adjust.)*
2. **Backfill policy** — enable `crm/workflow/analytics` for all existing
   companies (recommended, so nothing regresses), `field_ops` for distribution/
   field-sales companies, `integrations` **off** by default?
3. **Plan keys** — keep `free/standard/pro/unlimited` (display Free/Starter/
   Professional/Enterprise) — no key churn? *(Recommended.)*
4. **Scope of this slice** — taxonomy + seed + backfill + nav/entitlement helper +
   catalog wiring (recommended), with **add-on billing/pricing + metering** as a
   **follow-up** (R4-billing)? *(Recommended — keeps this slice reviewable.)*

## 7. Verification plan (when built)
Rolled-back live impersonation: schema/seed present; advisor 0 ERROR; **no tenant
loses a currently-enabled module** (backfill check); entitlement helper gates
nav/routes correctly; protected verticals untouched; cross-company isolation.
Then `tsc`/build/vitest + i18n parity. Production apply held for approval.

*(R4 Licensing Build design — paused for your review + the §6 decisions. Then:
finish UI alignment, then adapters B3b → B5 → B4.)*
