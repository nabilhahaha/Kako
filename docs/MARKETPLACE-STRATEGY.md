# VANTORA — Marketplace & Integrations Strategy (R5 review)

> Review item #5 — **strategy for approval**. No implementation yet. Builds on the
> Connector Framework (2C-1/2C-2), the licensing model
> ([`LICENSING-ARCHITECTURE.md`](LICENSING-ARCHITECTURE.md)), and the standing
> **platform-first, fully-modular, ERP-coexistence** principles.

VANTORA already has an in-app **module marketplace** (Settings → Marketplace,
`erp_company_modules`) for toggling **entitled first-party modules/packs**. This
strategy extends "marketplace" into a **catalog of installable + purchasable
integrations and modules**, including **third-party** and **partner-built** ones,
governed by entitlement + billing.

---

## 1. Three marketplaces (one catalog, three categories)

| Marketplace | What it lists | Who builds it | Monetization |
|---|---|---|---|
| **A. Module Marketplace** (exists 🟡) | First-party core modules + industry packs | VANTORA | Plan tier / per-module add-on (R4) |
| **B. Integrations Marketplace** | Connectors to external systems (ERP/accounting/BI/comms) | VANTORA + **partners** | Free, paid, or revenue-share |
| **C. (Future) AI Module Marketplace** | AI capabilities (assistants, forecasting, doc extraction) as modules | VANTORA + partners | Usage-metered add-ons |

All three are **the same entitlement substrate** (`erp_company_modules` +
billing), so install/enable/disable, licensing, and graceful degradation behave
identically — a marketplace listing is just an **entitled, installable
capability**.

---

## 2. Integrations Marketplace (B) — the near-term focus

### 2.1 Connector catalog
- A **registry of connectors** (first-party `generic_rest`, `csv_sftp`, and the
  roadmap vendor adapters: Dynamics BC → SAP → NetSuite → Odoo) presented as
  installable listings: name, category (ERP / Accounting / BI / Comms / Logistics),
  supported entities, direction, protocol, status, pricing.
- Installing a connector = creating an `erp_integrations` connection (2C-1) +
  entitling the **Integrations** module; configuring per-entity sync jobs (2C-2).
- **Coexistence-aware:** each listing states which modules/entities it can own or
  sync, reinforcing per-module/per-entity SoR.

### 2.2 Paid connector marketplace
- Connectors can be **free**, **paid (one-time/subscription)**, or
  **revenue-share** with a partner.
- Billing reuses `erp_billing_*`: a connector is a billable **add-on SKU** tied to
  the Integrations module; usage metering (sync volume / API calls from
  `erp_sync_runs` / `erp_integration_logs`) supports usage-based pricing.
- **Entitlement gate:** a paid connector only runs while its add-on is active;
  expiry → connection auto-pauses (graceful), data preserved.

### 2.3 Partner-developed adapters
- **SDK/contract:** the existing adapter interface (`src/lib/erp/connectors/` —
  descriptor + config schema + `pull`/`push` + field map) becomes the **public
  partner contract**. A partner adapter is a registered descriptor + runtime that
  plugs into the same dispatcher, Vault secrets, sync jobs, and audit — **no core
  changes**.
- **Trust & safety:** partner adapters run within the platform's guardrails
  (company-scoped, RLS, service-role dispatcher, Vault-stored credentials, full
  `erp_integration_logs` audit). A **review/certification** step gates listing.
  *(Sandboxing untrusted partner code is an open design item — §5.)*
- **Distribution:** partner listings carry attribution + revenue-share; versioned;
  can be deprecated without breaking installed connections.

---

## 3. (Future) AI Module Marketplace (C)
- AI capabilities packaged as **modules/add-ons** on the same entitlement +
  billing substrate: e.g. natural-language reporting, demand forecasting,
  document/invoice extraction, approval assistants.
- **Usage-metered** (tokens/calls) via the metering counters from R4; entitlement
  gates access; per-company enable/disable.
- Entity-based + config-gated like everything else — built once, sold many times.
- **Status: 🔜 future** — listed so it's tracked, not built now.

---

## 4. How it stays true to the principles
- **Platform-first / modular:** every marketplace item is an entitled, toggertable
  capability — buy one, several, a pack, or all.
- **Industry packs = add-ons** (not separate products) — they appear in the Module
  Marketplace as bundles.
- **Coexistence:** the Integrations Marketplace is the mechanism for "VANTORA
  alongside an external ERP," with per-module/per-entity SoR.
- **Protected:** medical/Clinic + Egyptian Drug List are first-party, always-on
  pack features — never marketplace-removable.
- **Security:** partner code is the only new trust surface — gated by review +
  platform guardrails (RLS, Vault, audit, service-role dispatcher).

---

## 5. Phasing & dependencies
1. **M0 (now-ish, on the framework):** present first-party connectors as a
   **catalog** in Settings → Integrations (read from the connector registry).
2. **M1:** connector listings as **entitled add-ons** (billing SKU + entitlement
   gate + metering) — depends on **R4 licensing build** + Billing Phase 2.
3. **M2:** **partner adapter contract** (public SDK + certification + sandboxing
   design) — depends on a stable adapter interface (post first vendor adapters
   B2–B5).
4. **M3 (future):** AI Module Marketplace — depends on M1 metering + an AI
   module foundation.

**Dependencies:** Integrations module (✅) · connector framework (✅) · vendor
adapters (B2–B5, 🔜) · licensing/metering (R4, 🔜) · Billing Phase 2 (🔜).

## 6. Open decisions (before any marketplace build)
1. **Partner program scope/timing** — do we open partner adapters in this cycle,
   or first-party-only marketplace until vendor adapters are proven? *(Recommend
   first-party catalog first; partner SDK after B2–B5.)*
2. **Sandboxing model for partner code** — in-process review-gated vs isolated
   execution (edge function / worker) for untrusted adapters.
3. **Monetization v1** — flat add-on pricing vs usage-based (sync volume) for paid
   connectors. *(Recommend flat add-on first; usage-based with metering later.)*
4. **AI marketplace** — confirm it stays parked as a tracked future item (R-series
   addition) until core adapters + licensing land.

*(Item #5 of the review sequence. Paused for review before #6 — Pilot Customer
Readiness Plan.)*
