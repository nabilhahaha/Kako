# VANTORA Business OS — Roadmap

Status: ✅ done · 🟡 foundation · 🔜 planned. See `ARCHITECTURE.md` for the
system; `OWNER_GUIDE.md` for operations.

> **Every item here is classified per `PRODUCT_PRINCIPLES.md`:** Core Platform →
> Reusable Module → Customer-Specific (prefer leftmost). Build once. Reuse
> everywhere. Sell many times. (e.g. Billing = Core Platform; Promotions =
> FMCG/Sales Module; Commission = Sales Module; Appointments = Scheduling Module.)

---

## 1. Completed milestones ✅

**Core platform**
- Multi-tenant SaaS (companies → branches → users) with **RLS on every table**.
- Plans × business-type **modules** (`erp_company_modules ∩ erp_plan_modules`);
  20+ business types; self-registration + 14-day trial; subscription gating.
- Three-layer **tenant permissions** (global → business-type templates →
  per-company overrides); 3-layer roles.
- **Verticals:** clinic, pharmacy, restaurant, salon, laundry, supermarket,
  wholesale, distribution, hotel — on one shared core.
- **Smart Setup Wizard** (per business type) + **App Marketplace** (toggle
  modules anytime) + **Organization Structure** (departments/teams/job titles,
  matrix reporting).
- Full **Arabic/English** i18n with RTL/LTR toggle (parity-tested).
- Premium unified landing + glass login; **VANTORA** brand.
- Observability (Sentry, env-gated), PWA, security headers, E2E smoke, backups +
  staging runbooks.

**Entity Framework & data engines**
- **Entity Registry** — single source of truth; standard fields contract
  (`company_id`, `branch_id`, `created_by/at`, `updated_by/at`, `status`,
  `external_id`); polymorphic notes/attachments; audit.
- **Import Engine V1** — Excel(`.xlsx`)/CSV/JSON → any entity; Upload → Map →
  Validate → Preview → Import → History; insert/update/upsert/skip; error report.
- **Mapping Templates** — save / clone / share / default (per company, per entity).
- **Export Engine V1** — any entity → CSV / Excel(`.xlsx`) / JSON; filters;
  permission- and company-scoped; round-trips with import.

**Platform ownership & internal staff (Phases 1–2)**
- Internal staff tier: roles (admin/sales/support/implementation/finance) +
  granular permissions; per-employee overrides.
- Owner-only escalation guarantees; `manage_users` cannot create Owners or grant
  permissions it lacks; **all permission changes audited**.
- Offboarding: disables platform access **and** auth login/sessions, without
  touching customer data.
- Staff Management UI + granular gates across the platform area; internal **audit
  trail** (who/what/when/which company).

**Commercial & extensibility layer**
- **Billing & Subscriptions (Phase 1)** — 8-currency price books, trials,
  plan-based access, country VAT, statuses, invoice history, owner-only admin.
- **Custom Fields Engine** (JSONB-on-row, 7 types) + **Dynamic Forms Foundation**.
- **Workflow / Approval Engine** (Phases 1–3) — conditional routing, parallel +
  quorum, SLA + escalation (`reports_to`), in-app notifications, Builder Lite,
  pg_cron scheduler.
- **Premium UI/UX & Design System** — navy/cyan tokens, shared primitives,
  rolled out to Dashboard / Customers / Approvals / Billing; `/design` showcase.

**Data Integration (Phase 2A–2C-2)**
- **2A Inbound REST API** (`/api/v1`) — per-company API keys (hashed, scoped,
  rate-limited), entity-writer reuse, full audit.
- **2B Outbound Webhooks** — HMAC-signed, pg_cron + pg_net delivery, backoff +
  dead-letter, event subscriptions.
- **2C-1 Connector Framework** — connection store + adapter registry; credentials
  in **Supabase Vault**; `generic_rest` + `csv_sftp` reference adapters.
- **2C-2 Sync Engine** — scheduled pull/push (Node dispatcher + Vercel Cron),
  per-entity sync jobs, watermark/delta, conflict policy, run log.
- **Modularity & coexistence principle** persisted (`PRODUCT_PRINCIPLES.md`).

---

## 2. Forward roadmap — formally tracked (do not drop or deprioritize)

These are **standing roadmap items**, each tracked with dependencies, priority,
complexity, sequence, and status. Goal: a **modular platform** supporting **ERP
coexistence** and **partial adoption** (Sales only / Inventory only / Workflow
only / Analytics only …) up to **full-platform** adoption.

There are two parallel tracks — **review/approval docs** (analysis, approved one
at a time) and **build sub-slices** (each design→build→verify→PR→prod-apply).

| # | Item | Track | Depends on | Priority | Complexity | Seq | Status |
|---|---|---|---|---|---|---|---|
| R1 | Adapter roadmap & architecture review | Review | 2C-2 | High | Low | 1 | ✅ approved |
| R2 | **Full Platform Documentation** (plan → docs) | Review→Build | R1 | High | Med | 2 | 🟡 plan approved; authoring next |
| R3 | **Legacy Audit Report** (Keep/Refactor/Archive/Delete) | Review | — | High | Med | 3 | ✅ delivered |
| R4 | **Module Licensing & Subscription Architecture** | Review | Billing, plan-modules, marketplace | High | Med–High | 4 | ✅ approved |
| R5 | **Marketplace / Integrations Module Strategy** | Review | R4 | Med | Med | 5 | ✅ approved |
| R6 | **Pilot Customer Readiness Plan** | Review | B1–B2, R2, R4 | High | Med | 6 | ✅ approved |
| R7 | **AI Module Marketplace** (future) | Review→Build | R5, metering | Med | High | later | 🔜 tracked |
| B1 | **2C-3 CSV/SFTP Transport** | Build | 2C-2 (✅) | High | Low–Med | 1 | ✅ merged |
| B2 | **Dynamics 365 Business Central adapter** | Build | 2C-1/2C-2, B1 | High | Med (OAuth2 + OData v4) | 2 | ✅ merged |
| B3a | **SAP S/4HANA Cloud adapter (OData)** | Build | B2 (OData pattern) | High | Med–High | 3 | ✅ merged |
| R4B | **R4 Licensing Build** (capability modules + entitlement + backfill) | Build | R4, UI-ALIGN | High | Med–High | done | ✅ merged (0095 applied to prod; no-regression verified) |
| BU | **UI Alignment Implementation** (Core Modules / Industry Packs / Suggested Roles) | Build | UI-ALIGNMENT-REVIEW, R4 | High | Med | done | ✅ merged (#43): field_ops any-of nav binding + new-company bridge + Suggested-Roles step (code-only, no DB change) |
| B3b | **SAP on-prem / ECC (file + middleware)** | Build | B1 (file), B3a | High | High | 4 | 🟡 built; in review (`ADAPTER-SAP-ONPREM.md`); no migration; live SAP+middleware validation pending a pilot |
| CSeed | **Capability-seed slice** — universal CRM/Workflow/Analytics/Integrations nav gating (new-company seed bridge) | Build | R4B, BU | Med | Low–Med | after B3b | 🔜 tracked follow-up |
| B5 | **Odoo adapter** | Build | framework | Med | Med (JSON-RPC) | 5 | 🟡 built; in review (`ADAPTER-ODOO.md`); no migration; live validation pending a pilot |
| B4 | **Oracle NetSuite adapter** | Build | framework | Med | Med–High (TBA OAuth1-HMAC) | 6 | 🔜 |

**Vendor-order override (standing):** a real pilot customer's ERP requirement
overrides the default B2→B5 order.

### Recommended sequencing
1. **R2 documentation authoring** proceeds in parallel (index + Module Catalog
   first) while reviews continue.
2. **R3 Legacy Audit → R4 Licensing → R5 Marketplace/Integrations strategy** as
   sequential review docs (each approved before the next).
3. **Build track:** **B1 (CSV/SFTP) → B2 (Dynamics BC)** is the first vendor
   adapter package (review #5 "first adapter implementation"); B3–B5 follow.
4. **R6 Pilot Customer Readiness** consolidates docs + first adapter + licensing
   into a go-to-market-ready package.

### Dependencies at a glance
- Adapters (B2–B5) all sit on the **proven 2C-1/2C-2 framework** + **B1** for
  file transport; each adds only protocol/auth/mapping.
- **R4 Licensing** builds on existing **plan-modules ∩ marketplace** entitlement;
  **R5** builds on R4; **R6** depends on the first adapter (B1–B2) + docs (R2) +
  licensing (R4).
- Detailed adapter analysis: `INTEGRATION-ADAPTERS.md`; doc plan:
  `DOCUMENTATION-PLAN.md`.

### Tracked industry packs (add-ons, not separate products)
Packs bundle core modules + vertical-specific features on the platform
(`PRODUCT_PRINCIPLES.md`; `LICENSING-ARCHITECTURE.md`). Built ones: **Clinic ✅,
Pharmacy ✅, Restaurant ✅, Salon ✅, Laundry ✅, Retail/Supermarket ✅,
Wholesale ✅, Distribution/FMCG ✅, Hotel ✅** (verticals on the shared core).

| Pack | Status | Notable scope |
|---|---|---|
| **Electrical Retail & Wholesale** | 🔜 tracked | **Multi-tier pricing (Retail / Half-Wholesale / Wholesale / Project)**, **warranty tracking**, **Returns & RMA**, **serial-number support**, Inventory, Purchasing, Accounting, POS. First pilot target. |

Pilot targets (R6): **FMCG Distribution · Electrical Retail & Wholesale ·
Pharmacy · Clinic** — each with a seeded demo environment.

## 3. Deferred / parked phases 🔜

- **Support / Ticketing** — `access_support_tickets` exists; tenant tickets +
  internal queue, SLA, attachments, CSAT; integrate with billing + audit.
- **Payment Gateways** — regional (HyperPay/PayTabs/Moyasar/Fawry/Tap) + Stripe;
  manual/offline flows exist. (Billing is gateway-ready.)
- **OAuth for third-party apps**; e-invoicing extensions (ZATCA/UAE).

---

## 5. GCC / Arabic market readiness requirements

Tracked as a cross-cutting checklist (some ✅ already, most 🔜 for the Billing
phase and beyond):

- **Language & layout** — full Arabic + RTL ✅; Arabic-first content; Hijri date
  display option 🔜.
- **Multi-currency** — EGP ✅ (current); add SAR/AED/KWD/QAR/BHD/OMR/USD with
  correct symbols, decimal places (KWD/BHD/OMR = 3 decimals) and formatting 🔜.
- **Tax / e-invoicing** — Egypt ETA foundation ✅ (inert); **KSA ZATCA** (Fatoora,
  QR, phased e-invoicing) 🔜; **UAE** VAT + upcoming e-invoicing 🔜; per-country
  VAT rates + tax registration number (TRN/VAT) fields 🔜.
- **Payments** — regional gateways (HyperPay, PayTabs, Moyasar, Fawry, Tap) 🔜;
  cash/bank-transfer flows first ✅-ish (manual).
- **Compliance & locale** — country/timezone per company; weekend = Fri/Sat
  option; Arabic invoice/print templates ✅ (clinic/sales); company VAT/CR number
  on documents 🔜; data residency awareness 🔜.
- **Number/date formatting** — locale-aware currency/number/date ✅ (extend per
  GCC currency) 🔜.

Sequencing: Billing & Subscription (carries multi-currency + GCC tax fields) →
Support/Ticketing → External Integrations, with GCC readiness items folded into
each phase rather than as a separate workstream.
