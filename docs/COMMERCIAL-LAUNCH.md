# VANTORA Business OS — Commercial Launch Package

> **Commercialization & go-to-market reference.** Built strictly on the approved
> baseline (`PLATFORM-REVIEW.md`, `COMPLETION-REPORT.md`, `LICENSING-ARCHITECTURE.md`).
> **No architecture changes, no new feature development** — this packages what is
> already built for sale. Pricing figures below are **launch recommendations** to
> confirm commercially (the platform already supports 8-currency price books,
> plans Free/Starter/Professional/Enterprise, and per-module/pack entitlement);
> billing/metering automation remains a deferred phase, so V1 billing is
> operated manually/offline as today.

---

## 1. Pricing strategy

**Positioning:** *Powerful like an ERP, simple like a modern SaaS — and it
coexists with the ERP you already run.* Price on **value + modularity**, not seat
count alone. **ERP coexistence is the primary differentiator** and the premium
anchor.

**Principles**
- **Platform-first**, modules independently licensable; **industry packs are
  add-ons**, never separate products.
- **Buy what you need**: one module / several / a pack / the full platform.
- **Tiered base plan** (capabilities + limits) **+ per-module / per-pack add-ons**
  **+ Integrations as a paid module**.
- **Land-and-expand**: start with one module or one pack on a low tier; grow into
  full platform + coexistence.
- **Region-aware**: EGP today; SAR/AED/KWD/QAR/BHD/OMR/USD via the existing price
  books (GCC tax/e-invoicing folded into the first GCC pilot).

**Pricing levers (in priority order)**
1. **Plan tier** (Free → Starter → Professional → Enterprise) — gates capability
   modules + usage limits (branches, users, API).
2. **Industry pack** add-on (Clinic / Pharmacy / Distribution / Electrical / …).
3. **Integrations module** (API → webhooks → connectors → full ERP adapters) —
   the coexistence premium.
4. **Implementation & onboarding** (one-time): data import, ERP-adapter mapping,
   training — especially for pilots.

**Discounting guardrails:** annual prepay (2 months free), pilot/reference
discounts time-boxed and tied to a case-study commitment, no perpetual
custom one-offs (keep the catalog clean).

---

## 2. Subscription packages

Recommended launch tiers (confirm amounts per market; keys map to the live
`free/standard/pro/unlimited`):

| | **Free** | **Starter** | **Professional** | **Enterprise** |
|---|---|---|---|---|
| Target | trial / micro | single shop / clinic | multi-branch SMB | mid-market + ERP coexistence |
| Core modules | CRM, Sales | + Inventory, Purchasing, Analytics (basic) | + Finance, POS, Workflow, Field Ops | all Core |
| Branches / warehouses | 1 | 1–2 | multi | unlimited |
| Users | small cap | low cap | higher cap | high/unlimited |
| Industry pack | — | 1 (add-on) | 1 included + add-ons | multiple |
| Integrations | — | API only | API + webhooks + 1 connector | **full ERP adapters** |
| Support | community | email | priority | priority + onboarding/SLA |
| Billing | — | monthly/annual | monthly/annual | annual + implementation |

**Add-ons (any tier where sensible):** additional Industry Pack · Integrations
upgrade · extra branches/users · implementation package.

**Entitlement enforcement** is already live: `plan ∩ business-type ∩ company`
with capability + pack modules; new companies seed tier-appropriate capabilities
(Capability-Seed slice). No build needed to sell this.

---

## 3. SaaS licensing model

- **Per-company subscription** (tenant) + **per-module / per-pack entitlement**;
  capability modules (CRM, Sales, Inventory, Purchasing, Finance, POS, Workflow,
  Analytics, Field Ops, Integrations) licensed à-la-carte; verticals sold as
  **packs** (bundle of Core modules + vertical features).
- **Plans** gate which modules a tier may enable + usage limits; **marketplace**
  toggles owned modules anytime.
- **Coexistence licensing**: the **Integrations** module is the paid gate for
  inbound API, outbound webhooks, connectors, and the **ERP adapters**
  (Dynamics / SAP / Odoo / NetSuite / CSV-SFTP) — graduated by tier.
- **Protected verticals** (Clinic / Pharmacy / Egyptian Drug List / Distribution /
  Electrical) are first-class, never gated away or removed.
- **Deferred (post-launch):** automated billing/metering, usage-based pricing,
  partner/reseller licensing, AI-module marketplace. V1 invoicing is
  manual/offline (the platform is gateway-ready).

---

## 4. Demo environments plan

**Four seeded demo tenants**, one per pilot vertical, on the production platform
(isolated tenants; no code change):

| Demo | Modules pre-enabled | Seeded data | Coexistence demo |
|---|---|---|---|
| **FMCG Distribution** | Sales, Inventory, Purchasing, CRM, Analytics, Field Ops, Workflow | reps, routes, journey plans, customers, products, stock | pull customers/products/stock from a sandbox ERP; push orders |
| **Electrical Retail & Wholesale** | Sales, Inventory, Purchasing, Finance, POS, Analytics + **Electrical pack** | tiered prices (Retail/Semi/Wholesale/Project), serialized products, warranties, sample RMA | items/stock in, sales/invoices out |
| **Pharmacy** | Sales, Inventory, Purchasing, Finance, POS, Analytics | dispensing register, expiry batches, Egyptian Drug List | optional ERP item/stock sync |
| **Clinic** | CRM, Sales, Inventory, Workflow, Analytics | patients, appointments, visits, services, invoices | optional finance sync |

**Setup checklist (per demo):** create tenant → enable modules/pack via
marketplace → import seed data (Import Engine) → configure roles (suggested-roles
step) → (coexistence demos) connect a sandbox adapter with default presets →
rehearse the demo script. **Reset cadence:** re-seed before each prospect.

---

## 5. Pilot customer plan

**Goal:** 3–4 reference customers, each validating one ERP adapter live and one
vertical end-to-end.

- **Profile:** SMB/mid-market in the pilot verticals; already running (or
  adopting) an ERP for finance/inventory; needs CRM / Sales / Field Ops /
  Workflow / Analytics that the ERP does poorly.
- **Commercial:** discounted/loaded pilot term (e.g. 60–90 days) → conversion to
  a paid annual plan + case study.
- **Success criteria:** adopted modules live; one ERP adapter syncing the agreed
  entities; users active daily; a measurable win (cycle time, visibility, error
  reduction); signed reference.
- **Support model:** named implementation contact, onboarding sessions, priority
  channel, weekly check-in during the pilot.
- **Sequence:** confirm ERP → stand up the seeded demo → live adapter validation
  (sandbox + middleware where SAP) → enable adopted modules/entities →
  coexistence sign-off → go-live → convert.

---

## 6. Landing page structure

1. **Hero** — "The Business OS that runs alongside your ERP." Sub: CRM, Sales,
   Field Ops, Workflow & Analytics — Arabic-first, GCC-ready. CTAs: *Book a demo* ·
   *Explore packs*.
2. **Problem / promise** — ERPs own finance/inventory but are weak at front-office
   + field execution; VANTORA fills that, syncing only what you choose.
3. **ERP coexistence** (the differentiator) — logos: SAP · Dynamics 365 · Oracle
   NetSuite · Odoo · CSV/SFTP; "keep your system of record."
4. **Core modules** — the 10, each one line + icon.
5. **Industry packs** — Clinic · Pharmacy · Distribution/FMCG · **Electrical Retail
   & Wholesale** · Retail · Restaurant · Hotel · Salon · Laundry · Wholesale.
6. **Why VANTORA** — modular (buy what you need) · Arabic/English + RTL · premium
   UX · multi-tenant security (RLS).
7. **Pricing** — the four tiers + "build your plan" (modules/packs/integrations).
8. **Proof** — pilot results / testimonials (post-pilot).
9. **Security & trust** — RLS, audit, Vault credentials, data residency awareness.
10. **Final CTA** — *Book a demo* / *Start free*. Footer: docs, contact, legal.

*(Content/marketing only — no app change.)*

---

## 7. Sales pitch deck structure

1. **Title** — VANTORA Business OS + tagline.
2. **The gap** — ERP vs front-office/field reality.
3. **What VANTORA is** — modular Business OS on a shared core.
4. **Coexistence** — the system-of-record split (ERP vs VANTORA), per entity.
5. **Core modules** — the 10 capabilities.
6. **Industry packs** — with the prospect's vertical highlighted.
7. **Live demo** — the matching seeded demo environment.
8. **ERP adapter portfolio** — the prospect's ERP called out (SAP/Dynamics/
   NetSuite/Odoo/CSV-SFTP), two-way, per-entity.
9. **Security & multi-tenancy** — RLS, audit, Vault.
10. **Pricing & packaging** — tier + pack + Integrations; land-and-expand.
11. **Pilot offer** — scope, timeline, success criteria, conversion.
12. **Roadmap & vision** — GCC tax, payments, AI marketplace (directional).
13. **Call to action** — start the pilot.

---

## 8. Go-to-market strategy

- **Beachhead:** the four pilot verticals in the Egypt/GCC market; Arabic-first.
- **Motion:** founder-led / direct sales for pilots → reference-driven expansion;
  vertical-by-vertical (lead with the pack the prospect needs).
- **Differentiator front and center:** **ERP coexistence** — VANTORA is additive
  to the incumbent ERP, lowering switching risk and shortening the sale.
- **Funnel:** landing page + demo booking → tailored demo (seeded env) → pilot →
  paid annual + case study → expand modules/packs/branches.
- **Pricing motion:** land on one module/pack at a low tier; expand to full
  platform + Integrations (coexistence) as the premium step-up.
- **Channel (later):** partner/reseller + connector marketplace (post first
  references; tracked, not now).
- **Regional readiness:** fold GCC currency/tax (ZATCA/UAE) into the first GCC
  pilot rather than as a separate workstream.
- **Metrics:** demos booked → pilot conversion → time-to-live → module/pack
  attach rate → coexistence (Integrations) attach → net revenue retention.

---

## 9. FMCG Distribution pilot — execution plan

- **Why first:** strongest fit for VANTORA's front-office + field strengths
  (routes, journey, van sales, trade spend, credit Workflow) alongside an ERP that
  owns items/stock/finance.
- **Modules:** Sales, Inventory (view), CRM, Analytics, **Field Ops**, Workflow
  (credit/approvals). Distribution vertical features (routes/journey/settlement).
- **Coexistence:** ERP (SAP ECC-file / S4-OData, Dynamics BC, NetSuite, or Odoo)
  owns Materials, Stock, Finance, Procurement. **Sync in:** customers (Business
  Partners), products/materials, stock levels. **Sync out:** sales orders +
  trade-spend settlements.
- **Steps:** (1) confirm ERP + entities → (2) seed the FMCG demo → (3) connect the
  adapter to a sandbox with default presets, validate two-way for the agreed
  entities (+ middleware if SAP ECC) → (4) load reps/routes/customers → (5) run a
  daily cycle (journey → van sale → settlement → sync) → (6) measure (visit
  compliance, order accuracy, collection visibility) → (7) coexistence sign-off →
  go-live → convert.
- **Success:** reps live daily; orders flowing to the ERP; route/collection
  visibility; signed reference.

---

## 10. Electrical Retail & Wholesale pilot — execution plan

- **Why now:** the **Electrical pack is complete** (multi-tier pricing, serials,
  warranty, RMA, supplier returns) — ready to demo and pilot.
- **Modules + pack:** Sales, Inventory, Purchasing, Finance, POS, Analytics +
  **Electrical pack** (tiers Retail/Semi-wholesale/Wholesale/Project; serialized
  items; warranty; RMA; supplier + customer returns; serialized transfers).
- **Coexistence:** ERP owns items/stock/finance where present; **VANTORA owns POS
  + multi-tier pricing + warranty + serials + RMA** (these stay VANTORA-side, never
  overwritten). **Sync in:** items, stock, customers. **Sync out:** sales,
  invoices.
- **Steps:** (1) confirm catalog + tier structure → (2) seed the Electrical demo
  (tiered prices, serialized products, warranties) → (3) configure tiers + assign
  customer levels → (4) run counter + wholesale + project sales with serial
  capture → (5) exercise warranty lookup + an RMA (refund/replace) + a supplier
  return → (6) (if ERP) sync items/stock in, sales/invoices out → (7) measure
  (pricing accuracy across tiers, serial traceability, RMA cycle time) → go-live →
  convert.
- **Success:** correct tiered pricing incl. Project; serial-tracked sales;
  warranty + RMA workflow in daily use; supplier returns posting correctly; signed
  reference.

---

*Commercial launch package — built on the approved baseline; no architecture or
feature changes. Recommended first execution step remains a pilot's **live ERP-
adapter validation**. Confirm launch pricing amounts per market to finalize §1–§2.*
