# VANTORA — Module Licensing & Subscription Architecture (R4 review)

> Review item #4 — **target-state design for approval**. No implementation yet.
> Companion to the reference doc [`LICENSING.md`](LICENSING.md). Goal: every
> module **independently licensable**, **per-company subscription** + **per-module
> entitlement**, supporting **partial adoption** and **ERP coexistence**.

---

## 1. Current state (grounded)

- **Plans (`erp_plans`):** `free` (0) · `standard` (1) · `pro` (2) · `unlimited`
  (3). Trials currently 0 days on the rows (self-registration grants a 14-day
  trial separately).
- **Entitlement tables:** `erp_plan_modules` (plan → module) ∩ business-type
  module taxonomy ∩ `erp_company_modules` (per-company marketplace toggle).
- **Existing module keys are mixed granularity** — verticals (`clinic`,
  `pharmacy`, `restaurant`, `salon`, `laundry`, `market`, `wholesale`,
  `distribution`, `hotel`) **and** capabilities (`sales`, `inventory`,
  `accounting`, `purchasing`, `pos`, `returns`, `sales_orders`, `warehousing`).
- **Billing (`erp_billing_*`):** 8-currency price books, statuses, invoices,
  country VAT, owner-only admin (built).

**Gap to close:** formalize a clean **capability-module** dimension (CRM, Sales,
Field Ops, Workflow, Analytics, Inventory, Procurement, Finance, Integrations,
Billing) alongside the existing **vertical packs**, and connect entitlement to
billing price points. All changes **additive** — no break to current data.

---

## 2. Target model — two dimensions

```
Entitlement(company, capability) = TRUE iff
     ( capability ∈ plan(company).included            -- per-company subscription
       OR capability ∈ company.addons )               -- per-module entitlement
   ∩ enabled_in_marketplace(company, capability)       -- company toggle
   ∩ ( no vertical gate OR vertical_pack_owned )       -- industry packs
```

**A. Capability modules** (cross-industry, independently licensable):
`CRM · Sales · Field Operations · Workflow & Approvals · Analytics · Inventory ·
Procurement · Finance · Integrations · Billing`.
Each maps to existing permissions/entities (e.g. CRM→`customers.manage`+`customer`;
Field Ops→`field.sales`; Workflow→`workflow.manage`; Analytics→`reports.view`+
export; Finance→`accounting.*`; Procurement→`purchasing.manage`+`suppliers.manage`;
Integrations→`integrations.manage`). New module keys (`crm`, `field_ops`,
`workflow`, `analytics`, `finance`, `integrations`) are **added**; legacy keys
remain as aliases (no data break).

**B. Vertical packs** (industry bundles on top of capabilities):
`Clinic · Pharmacy · Restaurant · Salon · Laundry · Retail/Supermarket ·
Wholesale · Distribution/FMCG · Hotel`. A pack bundles the relevant capability
modules + vertical-specific features (e.g. Pharmacy = Sales + Inventory +
**Egyptian Drug List/dispensing**; Clinic = CRM + Scheduling + clinical features).

**Licensing knobs:**
1. **Per-company subscription** — the plan tier bundles a set of capability
   modules + limits.
2. **Per-module entitlement (add-ons)** — any capability module can be added
   à-la-carte beyond the bundle (or removed), so a customer can license, e.g.,
   *Sales only* or *Inventory + Integrations only*.
3. **Marketplace toggle** — enable/disable an entitled module per company.

---

## 3. Plan tiers (proposed)

Keep stable keys, set display names + inclusions (additive config):
`free→Free`, `standard→Starter`, `pro→Professional`, `unlimited→Enterprise`.

| | **Free** | **Starter** | **Professional** | **Enterprise** |
|---|---|---|---|---|
| Price | $0 | low | mid | custom |
| Included capability modules | CRM, Sales (core) | + Inventory, Procurement, Analytics (basic) | + Field Ops, Workflow & Approvals, Finance, Analytics (full) | **All** capability modules |
| Integrations module | — | inbound API only | API + webhooks + 1 connection | full (multi-connection sync, all adapters) |
| Vertical pack | 1 (basic) | 1 | 1–2 | unlimited |
| Users / branches | tight caps | modest | higher | unlimited / negotiated |
| Limits (API calls / sync volume / seats) | minimal | metered | higher | custom / SLA |
| Support | community | email | priority | dedicated + onboarding |
| Add-ons (per-module) | — | yes | yes | included |

(Exact module-per-tier and numeric limits are a **decision** — §8.)

---

## 4. Independently licensable capability modules

Each is licensable standalone (plan inclusion **or** add-on) and degrades
gracefully when off:

| Capability | Maps to | Standalone? | Notes |
|---|---|---|---|
| **CRM** | `customers.manage`, `customer` | ✅ | customers/accounts, journey |
| **Sales** | `sales.*`, `order`, `invoice`, POS | ✅ | quotes→orders→invoices, returns |
| **Field Operations** | `field.sales`, routes/visits/van | ✅ | rep journeys, van stock |
| **Workflow & Approvals** | `workflow.manage` | ✅ | orchestrates any entity |
| **Analytics & Reporting** | `reports.view`, exports | ✅ | dashboards, exports, BI feed |
| **Inventory & Warehousing** | `inventory.*`, `product` | ✅ | stock, counts, transfers |
| **Procurement** | `purchasing.manage`, `suppliers.manage`, `supplier` | ✅ | POs, receiving |
| **Finance** | `accounting.*` | ✅ | journals, AR aging, e-invoicing |
| **Integrations** | `integrations.manage` | ✅ | the ERP-coexistence bridge |
| **Billing** | platform (owner) | platform | SaaS billing (not a tenant add-on) |

---

## 5. Worked examples

**Clinic** — *Professional* + **Clinic pack**: CRM (patients) + Scheduling
(appointments) + clinical/visit features + Sales (fees) + Finance (posting). No
Field Ops/Procurement unless added. Standalone SoR.

**Pharmacy** — *Professional* + **Pharmacy pack**: Sales (POS) + Inventory +
**Egyptian Drug List / dispensing** + Finance. May add **Integrations** to sync
stock from a wholesaler/ERP. (Drug List is a protected, always-included pack
feature.)

**Distribution / FMCG** — *Enterprise* + **Distribution pack**: Field Operations
(routes/van/journey) + Sales (orders) + Inventory + **Trade Spend** (promotions/
settlements) + Workflow (credit-limit/trade-spend approvals) + **Integrations**
(SoR split: SAP owns Finance/Inventory, VANTORA owns CRM/Field Ops/Trade Spend).
Classic coexistence.

**Retail / Supermarket** — *Starter/Professional* + **Retail pack**: Sales (POS) +
Inventory + Procurement + Analytics. Add **Integrations** to push sales to an
accounting ERP (Finance ERP-owned), or run Finance in VANTORA standalone.

---

## 6. Coexistence licensing
The **Integrations** module is what enables "VANTORA alongside an external ERP."
A customer licenses only the modules they adopt; the ERP keeps SoR for the rest
(see [`MODULE-OWNERSHIP-MATRIX.md`](MODULE-OWNERSHIP-MATRIX.md)). Integrations is
metered (connections, sync volume) and tiered per plan.

## 7. Enforcement points (where entitlement is checked)
- **Navigation** — hide modules a company isn't entitled to / hasn't enabled.
- **Route guards** — server-side check on each module's pages (redirect to
  `/upgrade` when not entitled — pattern already exists).
- **Action/RPC guards** — entitlement check alongside permission check before
  writes.
- **Graceful degradation** — a disabled module's data remains intact and
  read-safe; siblings never break (feature-detect).
- **Single source:** one `entitled(company, capability)` helper used by all
  three layers.

## 8. Migration & compatibility (additive — no legacy removal)
- Add capability-module keys + a `plan ↔ module ↔ price` mapping; keep legacy
  keys as **aliases** (vertical packs reference capability modules).
- Map plan display names (`standard→Starter`, etc.); **keep keys** to avoid data
  churn.
- Legacy `erp_companies` subscription fields stay **synced** from billing until
  Billing Phase 2 retires them — **no removal now**.
- **No medical/Clinic or Egyptian Drug List changes.** Pharmacy/Clinic packs are
  protected and always include their vertical features.

## 9. Usage metering (for tiered/add-on pricing)
Counters for **API calls**, **sync volume/runs**, **seats**, **connections** —
sourced from existing logs (`erp_integration_logs`, `erp_sync_runs`) + user
counts. Feeds plan limits + Enterprise/usage pricing. (Design only here.)

## 10. Decisions to confirm (before any build)
1. **Module-per-tier matrix** — confirm exactly which capability modules each of
   Free/Starter/Professional/Enterprise includes (the §3 table is a proposal).
2. **Plan keys** — keep `free/standard/pro/unlimited` with new display names
   (recommended, no churn) or introduce `starter/professional/enterprise` keys?
3. **Add-ons billing** — per-module add-ons priced individually, or only via
   tier bundles in v1? *(Recommend: tiers in v1, add-ons as a fast follow.)*
4. **Vertical packs as SKUs** — packs priced separately from capability tiers, or
   bundled into tiers by business type?
5. **Metering scope for v1** — enforce seat/connection caps first; defer
   usage-based (API/sync volume) pricing?

*(Item #4 of the review sequence. Paused for review before #5 — Marketplace /
Integrations Module Strategy.)*
