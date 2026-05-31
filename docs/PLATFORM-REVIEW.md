# VANTORA Business OS — Final Platform Review Package

> **Official post-build platform baseline.** Status legend: ✅ built · 🟡
> foundation/partial · 🔜 planned. This document is the canonical reference for
> the platform after the Data Integration + Licensing + UI-Alignment + ERP
> Adapter program. Grounded in the codebase as of this baseline (95 migrations;
> 6 connector adapters; 271 unit tests passing / 10 skipped; `tsc` + `next build`
> clean). No production DB change is implied by this document.

---

## 1. Executive Summary

VANTORA is a **multi-tenant, fully-modular Business OS** (Next.js 15 App Router +
Supabase Postgres 17 with **RLS on every table**) that adapts per business type
from a **shared core** — "powerful like an ERP, simple like a modern SaaS,"
targeted at GCC and Arab markets with **full Arabic/English + RTL** parity.

What the build program delivered, on top of the existing vertical platform
(clinic, pharmacy, restaurant, salon, laundry, supermarket, wholesale,
distribution, hotel):

- **Data Integration Phase 2** — inbound REST API (`/api/v1`, hashed scoped
  rate-limited keys), outbound HMAC webhooks (pg_cron + pg_net), a connector
  framework (Vault-stored credentials), and a scheduled sync engine (Node
  dispatcher + Vercel Cron, per-entity pull/push, watermark delta, conflict
  policy).
- **A 6-adapter ERP coexistence portfolio** — generic REST + CSV/SFTP reference
  transports and **four vendor adapters**: Dynamics 365 Business Central, SAP
  S/4HANA (Cloud OData + On-Prem/ECC file), Odoo, Oracle NetSuite — all on one
  framework, two-way, per-entity ownership.
- **Module licensing as first-class entitlements** — capability (Core) modules
  separated from Industry Packs, à-la-carte licensable, with a no-regression
  backfill (migration 0095, applied + verified).
- **UI alignment** — company creation and Marketplace cleanly separate **Core
  Modules / Industry Packs / Suggested Roles**; navigation is capability-aware.

**Posture:** production-safe and reviewable throughout — every migration additive
+ idempotent + rolled-back-live-verified; protected verticals (Clinic / Pharmacy
/ Egyptian Drug List / Distribution / Electrical) never altered; no infra secrets
in the app DB. Vendor adapters are **mock/unit-tested**, pending live validation
with pilot ERP systems.

---

## 2. Platform Architecture

- **Frontend/runtime:** Next.js 15 (App Router, React Server Components, Server
  Actions, Route Handlers). Node runtime for native-dep paths (`ssh2` via
  `serverExternalPackages`).
- **Data:** Supabase Postgres 17. **RLS on every tenant table**; SECURITY DEFINER
  RPCs pin `search_path` and revoke `anon/public`. **95 migrations**, all additive
  / idempotent.
- **Tenancy:** companies → branches → users; per-company subscription + module
  entitlement; three-layer permissions (global → business-type template →
  per-company override).
- **Async/infra:** **pg_cron** (schedulers), **pg_net** (async HTTP for
  webhooks), **Supabase Vault** (integration credentials), **pgcrypto** (in the
  `extensions` schema). Vercel Cron → Node dispatcher for sync.
- **Entity Framework:** an Entity Registry is the single source of truth (standard
  fields contract: `company_id`, `branch_id`, `created/updated_*`, `status`,
  `external_id`); polymorphic notes/attachments; audit; Import/Export engines.
- **Observability/ops:** Sentry (env-gated), PWA, security headers, E2E smoke,
  staging + backup runbooks.
- **i18n/design:** custom `t()` with ar/en parity test; navy/cyan design system +
  shared primitives.

**Modularity & coexistence principle** (`PRODUCT_PRINCIPLES.md`): build once at
the leftmost layer (Core Platform → Reusable Module → Customer-Specific); modules
are independently usable; the platform can **coexist with an external ERP**,
syncing only selected modules, with a system-of-record per module/entity.

---

## 3. Licensing & Subscription Model

- **Entitlement = three-way intersection:** `erp_plan_modules` (plan→module) ∩
  `erp_business_type_modules` (type→module) ∩ `erp_company_modules` (company→
  module, `enabled`). Each layer falls back to "all" when unset → legacy tenants
  are never accidentally locked out.
- **Plans:** `free` / `standard` / `pro` / `unlimited` (displayed Free / Starter /
  Professional / Enterprise); 8-currency price books; trials; country VAT;
  owner-only admin.
- **Capability modules as first-class entitlements (R4B / migration 0095):** the
  Core modules `crm, workflow, analytics, field_ops, integrations` were registered
  as licensable keys (joining `sales, inventory, purchasing, accounting≙finance,
  pos`), seeded per tier, with a **no-regression backfill** (every existing
  company keeps all enabled modules; `integrations` enabled only where already in
  use). Verified live (rolled-back) before apply; applied to production.
- **Business Type only PRESELECTS** recommended modules + pack — it never
  restricts licensing choices.
- **À-la-carte:** a customer can buy one module, several, a pack, or the full
  platform.
- **Out of scope (separate future phase):** billing/pricing/add-on **metering** —
  intentionally deferred; no pricing/metering changes were made in this program.

---

## 4. Core Modules (capabilities)

Independently licensable capabilities on the shared core:

| Module | DB key | Notes |
|---|---|---|
| CRM | `crm` | customers/contacts execution |
| Sales | `sales` | invoices, quick sale, orders (`sales_orders`), returns |
| Inventory | `inventory` (+`warehousing`) | stock, transfers, counts, warehouses |
| Purchasing | `purchasing` | suppliers, purchase orders |
| Finance / Accounting | `accounting` | chart, vouchers, journal, aging, reports |
| POS | `pos` | counter sale |
| Workflow & Approvals | `workflow` | conditional routing, parallel + quorum, SLA |
| Analytics | `analytics` | reports |
| Field Operations | `field_ops` | rep app, journey, settlement, routes |
| Integrations | `integrations` | API keys, webhooks, connections, sync |

Finer item-level modules (`pos, sales_orders, returns, warehousing`) refine
sections by business type. Marketplace + Setup Wizard group **Core vs Pack**.

---

## 5. Industry Packs (verticals on the shared core)

| Pack | Status | Notable scope |
|---|---|---|
| Clinic | ✅ | reception/doctor/appointments/visits/services; medical features + Egyptian Drug List (**protected**) |
| Pharmacy | ✅ | dispensing + expiry tracking (**protected**) |
| Distribution / FMCG | ✅ | routes, journey, rep targets, settlement (**protected**) |
| Retail / Supermarket | ✅ | quick cashier |
| Wholesale | ✅ | tiered price levels |
| Restaurant / Café | ✅ | tables/orders/kitchen |
| Hotel | ✅ | rooms/bookings |
| Salon | ✅ | appointments/tickets/services |
| Laundry | ✅ | orders/wash/delivery |
| **Electrical Retail & Wholesale** | 🔜 tracked | multi-tier pricing (Retail/Half-Wholesale/Wholesale/Project), warranty, Returns & RMA, serials, inventory/purchasing/accounting/POS (**protected scope**); first pilot target |

Packs only **bundle** core modules + vertical features; they are add-ons, not
separate products.

---

## 6. ERP Adapter Portfolio

One framework (`erp_integrations` + Vault secret + `erp_sync_jobs`/`_runs` +
Node dispatcher), two-way, per-entity ownership + conflict policy. **6 registered
adapters**; all unit/mock-tested; live validation pending pilot systems.

| Adapter | Key | Transport / Auth | Delta | Status |
|---|---|---|---|---|
| Generic REST | `generic_rest` | REST/JSON; header token | cursor param | ✅ reference |
| CSV/SFTP | `csv_sftp` | SFTP files (CSV/JSON) | full snapshot | ✅ B1 |
| Dynamics 365 BC | `dynamics_bc` | OData v4; Azure AD OAuth2 | `$filter modified gt` | ✅ B2 |
| SAP S/4HANA Cloud | `sap_s4` (odata) | OData v2/v4; OAuth2/Basic | OData `$filter` | ✅ B3a |
| SAP On-Prem / ECC | `sap_s4` (file) | SFTP files + middleware (IDoc/CSV); **never RFC/BAPI** | full snapshot | ✅ B3b |
| Odoo | `odoo` | JSON-RPC; API key (v14+) / user-pass | `write_date >` | ✅ B5 |
| Oracle NetSuite | `netsuite` | SuiteTalk REST; TBA (OAuth 1.0a HMAC-SHA256) | `lastModifiedDate` | ✅ B4 |

Shared runtime infra: `odata.ts` (version-aware OData), `oauth2.ts` (client-
credentials), **`oauth1.ts`** (TBA signer, Node crypto, known-vector tested),
`generic-rest-runtime.ts` (`mapRecord`), `csv-sftp-runtime.ts` (reused by SAP
file transport). Default entity mappings per adapter (customer/supplier/product
in; order/invoice out), all overridable per job.

**Coexistence boundary:** SAP ECC/On-Prem integrate **only** via OData/SFTP +
customer middleware — VANTORA never connects to RFC/BAPI directly.

---

## 7. Integration Strategy

- **Inbound (2A):** `/api/v1/[entity]` with per-company hashed, scoped,
  rate-limited API keys; reuses the entity-writer; fully audited.
- **Outbound (2B):** HMAC-signed webhooks, pg_cron + pg_net delivery, backoff +
  dead-letter; event subscriptions (customer/supplier/product created+updated,
  approval.completed, invoice.created).
- **Connector framework (2C-1):** connection store + adapter registry; credentials
  in Vault; reference adapters prove the framework.
- **Sync engine (2C-2):** scheduled pull/push, per-entity jobs, watermark/delta,
  conflict policy (`source_wins` upsert vs `vantora_wins`/`manual_review` insert),
  run log.
- **Adapters (B1–B5):** protocol/auth/mapping only, on the proven framework.
- **System-of-record per module/entity:** ERP may own Finance/Inventory/
  Procurement; VANTORA owns CRM/Sales/Field Ops/Trade Spend/Workflow/Analytics —
  configurable per entity and direction.

---

## 8. UI Alignment Summary

- **Company creation (Setup Wizard):** steps are business questions → **Modules**
  (grouped **Core Modules** vs **Industry Pack**) → **Suggested Roles** → review.
  Suggested roles are pack-generated, friendly-labelled, and explicitly
  **editable later in Settings → Permissions**; seeded by the existing
  `erp_seed_company_roles` (no new write path).
- **Marketplace:** Core Modules and Industry Packs shown as distinct sections.
- **Navigation:** capability-aware. Field-sales items bind to
  `['field_ops','distribution']` (**any-of**) so the new capability is recognised
  without regressing legacy free/standard distribution tenants. New field-sales
  companies get `field_ops` via the wizard bridge.
- **Deferred (tracked):** universal nav gating of `crm/workflow/analytics/
  integrations` awaits a small **capability-seed slice** (new-company seeding);
  doing it now would regress new companies of unseeded business types.

---

## 9. Security & Permissions Model

- **RLS on every tenant table**; company/branch scoping enforced in the database.
- **SECURITY DEFINER RPCs** pin `search_path='public','pg_temp'` (+`extensions`
  where pgcrypto is used) and **revoke anon/public**.
- **Three-layer tenant permissions** (global → business-type template →
  per-company override) + 3-layer roles; keyed roles (`role_key`).
- **Platform/vendor tier** (owner + internal staff): granular platform
  permissions, per-employee overrides; **owner-only escalation guarantees**
  (`manage_users` can't create Owners or grant permissions it lacks); **all
  permission changes audited**; offboarding disables access + auth sessions
  without touching customer data.
- **Integration security:** API keys hashed + scoped + rate-limited; webhooks
  HMAC-signed; **integration credentials in Supabase Vault** (never in the app DB
  or infra env); NetSuite TBA secrets packed into the single Vault secret.
- **Verification discipline:** every migration applied in a transaction on the
  live project, checked, then ROLLBACK-verified before any real apply; advisor
  run for 0 ERROR + non-anon-executable.

---

## 10. Remaining Roadmap

| Item | Priority | Notes |
|---|---|---|
| **Capability-seed slice** (universal crm/workflow/analytics/integrations nav gating) | High | new-company seed bridge; additive seed migration |
| **Electrical Retail & Wholesale pack** build | High | first pilot target; multi-tier pricing/warranty/RMA/serials |
| **Live ERP adapter validation** | High | per pilot: Dynamics/SAP/Odoo/NetSuite sandboxes + (SAP) middleware |
| **Add-on billing / pricing / metering** (R4-billing) | Med | the deferred commercial layer |
| **R7 AI Module Marketplace** | Med | future |
| **Support / Ticketing** | Med | tenant + internal queue, SLA, CSAT |
| **Payment gateways** | Med | HyperPay/PayTabs/Moyasar/Fawry/Tap + Stripe |
| **GCC readiness** | Med | SAR/AED/KWD/QAR/BHD/OMR/USD; ZATCA/UAE e-invoicing; Hijri |
| **OAuth for third-party apps**; partner connector marketplace | Low–Med | post first pilots |
| CP4/CP5 legacy cleanup | Low | deferred per `CLEANUP-PLAN.md` |

---

## 11. Technical Debt Register

| Item | Risk | Note |
|---|---|---|
| Vendor adapters mock-tested only | Med | no live ERP validation yet; field names/delta formats (e.g. SAP OData datetime literal) need per-deployment confirmation |
| NetSuite secret packing (`consumer_secret:token_secret`) | Low | pragmatic single-Vault-secret reuse; a 2-secret model is cleaner long-term |
| File feeds = full snapshot (csv_sftp, SAP file) | Low | no incremental delta for file transport; acceptable for batch feeds |
| Capability nav gating partial (field_ops only) | Low | crm/workflow/analytics/integrations gating awaits the seed slice |
| Adapter push idempotency | Med | `create`-based push; upsert/external-id reconciliation per vendor is a follow-up |
| Legacy audit items CP4/CP5 | Low | classified, deferred; no direct deletions outside approved scopes |
| Live HTTP smoke tests for sync dispatcher | Low | blocked in this env (egress/secret constraints); covered by unit + staging |

---

## 12. Future Enhancements

- **SuiteQL** (NetSuite) + **IDoc-XML** (SAP) richer extractors; per-vendor
  upsert/reconciliation.
- **Incremental file deltas** (manifest/changed-since) for SFTP feeds.
- **Bidirectional conflict UI** (manual_review queue surfacing).
- **Partner-developed adapters** + paid connector marketplace; **AI module
  marketplace** (R7).
- **Trade Spend** module formalization; advanced Analytics dashboards.
- Full capability nav gating once the seed slice ships.

---

## 13. Commercial Packaging Recommendations

- **Platform-first**, modules independently licensable; **industry packs are
  add-ons**, not separate products.
- **Monetization V1:** subscription plans (Free/Starter/Professional/Enterprise)
  + module licensing + industry packs + **Integrations as a paid module**.
- Tiering aligned to the seeded plan matrix (CRM/Sales broadly available;
  Workflow/Field Ops at Professional+; Integrations graduated API→webhooks→
  connections→full).
- **Defer** add-on billing/metering to the R4-billing phase; keep V1 packaging
  simple and reviewable.

---

## 14. Pilot Customer Recommendations

Four seeded demo environments, matched to the strongest verticals + adapters:

1. **FMCG Distribution** — field ops + routes/journey + trade spend; ERP
   coexistence via SAP (ECC file / S4 OData), Dynamics BC, NetSuite, or Odoo.
2. **Electrical Retail & Wholesale** — multi-tier pricing + warranty + serials
   (pack build is the gating dependency); POS + inventory.
3. **Pharmacy** — dispensing + expiry + Egyptian Drug List (protected).
4. **Clinic** — reception/doctor/appointments; medical features (protected).

Each pilot: confirm the customer's ERP → validate that single adapter live
(sandbox + middleware where SAP) → enable only the adopted modules/entities.

---

## 15. Go-To-Market Recommendations

1. **Lead with platform + the pilot's vertical pack**, not a feature list.
2. **Sequence:** (a) ship the **Electrical pack** + the **capability-seed slice**;
   (b) stand up the 4 demo environments; (c) validate **one** ERP adapter live per
   pilot before committing coexistence scope.
3. **Position ERP coexistence** as the differentiator: "keep your ERP as the
   system of record; VANTORA runs CRM/Sales/Field Ops/Workflow/Analytics, syncing
   only what you choose."
4. **Commercial:** platform-first + module licensing + packs as add-ons +
   Integrations as a paid module; hold billing/metering for the follow-up phase.
5. **Region:** Arabic-first + RTL is live; fold GCC currency/tax (ZATCA/UAE) into
   the first GCC pilot rather than as a separate workstream.
6. **Risk control:** keep the additive/idempotent + rolled-back-live verification
   discipline for every production change; protected verticals remain immutable.

---

*Baseline compiled at the close of the Data Integration + Licensing + UI-Alignment
+ ERP Adapter program. Source of truth for capabilities: this repo's `docs/` set
(`ARCHITECTURE.md`, `LICENSING-ARCHITECTURE.md`, `INTEGRATION-ADAPTERS.md`, the
per-adapter `ADAPTER-*.md`, `ROADMAP.md`, `PRODUCT_PRINCIPLES.md`). No production
DB change is implied by this document.*
