# VANTORA — Licensing & Entitlements

How module access, plans, and subscriptions fit together so customers can adopt
**module-by-module** or run the full platform. This is the **reference** doc; the
deeper *Module Licensing & Subscription Architecture review* (roadmap R4) will
extend it with the target-state design.

---

## 1. Entitlement model (what a company can use)

A module/feature is available to a company when **all** hold:

```
available(module) = entitled_by_plan(module)
                  ∩ allowed_for_business_type(module)
                  ∩ enabled_in_marketplace(module)
```

- **Plan entitlement** — `erp_plans` × `erp_plan_modules` (migrations 0023/0027):
  which modules each subscription plan includes.
- **Business-type fit** — business-type → module taxonomy (0036/0044/0063 +
  per-vertical module migrations): which modules make sense for a business type.
- **Per-company enablement** — `erp_company_modules`: the **App Marketplace**
  (Settings → Marketplace) lets a company toggle entitled modules on/off anytime.

Permissions (`src/lib/erp/permissions.ts`, three-layer: global → business-type
template → per-company override) then gate **who** inside the company can use an
enabled module.

## 2. Subscriptions & billing
- **Billing (Phase 1, built):** `erp_billing_*` — multi-currency price books
  (SAR/AED/KWD/QAR/BHD/OMR/EGP/USD), monthly/yearly, trials, statuses
  (Trial/Active/Suspended/Cancelled/Expired), invoice history, country VAT;
  owner-only administration. See [`MODULE-CATALOG.md`](MODULE-CATALOG.md) → Billing.
- Legacy subscription fields on `erp_companies` are **synced** from the billing
  tables (transition compatibility).
- Self-registration grants a **14-day trial**; subscription state gates access.

## 3. Modularity guarantees (must stay true)
- **Entitlement is config, not code.** No `if (businessType === …)` for access —
  gating is data (plan ∩ type ∩ marketplace).
- **No hard module→module dependency.** A module runs if entitled+enabled and
  **degrades gracefully** when a sibling is off (feature-detect, don't assume).
- **Integrations is itself a module/entitlement** (`integrations.manage`) — so a
  customer can license, e.g., *Sales only* + *Integrations* to sync from their ERP.
- **Partial adoption is first-class:** Sales-only, Inventory-only, Workflow-only,
  Analytics-only, … up to full platform.

## 4. Coexistence & licensing
When VANTORA runs **alongside an external ERP**, the customer licenses only the
modules they adopt; the ERP keeps SoR for the rest (see
[`MODULE-OWNERSHIP-MATRIX.md`](MODULE-OWNERSHIP-MATRIX.md)). The Integrations
module is what connects them.

## 5. Open items for the R4 architecture review
- Formalize the **module ↔ plan ↔ price** mapping as a first-class catalog
  (per-module SKUs / add-ons vs bundled plans).
- **Usage metering** (API calls, sync volume, seats) for tiered/usage pricing.
- **Marketplace as paid add-ons** (R5 strategy) — entitlement + billing hooks.
- Proration, upgrades/downgrades, dunning (Billing Phase 2).
- Enforcement points: where entitlement is checked (nav, route guards, RPC
  guards) and how a disabled module behaves at the data layer.

*(First-pass reference; R4 will deepen the target-state design.)*
