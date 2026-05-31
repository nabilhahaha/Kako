# VANTORA Business OS — Roadmap

Status: ✅ done · 🟡 foundation · 🔜 planned. See `ARCHITECTURE.md` for the
system; `OWNER_GUIDE.md` for operations.

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

---

## 2. Billing & Subscription phase 🔜 (next)

Goal: turn subscription state into a real, multi-currency, GCC-ready billing
system. (Detailed plan presented separately before build.)

- **Plans & pricing** — versioned plan catalog; monthly/annual; per-currency
  price books (**EGP, SAR, AED, KWD, QAR, BHD, OMR, USD**); trials, proration.
- **Subscriptions & lifecycle** — active/trialing/past_due/suspended/cancelled;
  renewals, upgrades/downgrades with proration; dunning.
- **Invoices & payments** — billing invoices (separate from sales invoices);
  payment records; manual/offline (bank transfer, cash) first; pluggable
  gateways later (regional: HyperPay/PayTabs/Moyasar/Fawry; global: Stripe).
- **Tax** — per-country VAT (KSA/UAE 15%/5%, etc.); tax-inclusive/exclusive;
  invoice fields for GCC e-invoicing (ZATCA/UAE) hooks.
- **Permissions/audit** — gated by `manage_billing`; every change audited; RLS
  for billing tables; SECURITY DEFINER RPCs for state transitions.
- **Owner/staff UX** — billing on the company detail page + a billing overview;
  finance role operates it.

## 3. Support / Ticketing phase 🔜

- `access_support_tickets` permission already exists (no surface yet).
- Tenant-raised tickets + internal queue; statuses, assignment to staff,
  SLA/priority; comments + attachments (reuse entity attachments); per-company
  scoping with staff cross-tenant access via `access_support_tickets`.
- Notifications (in-app + WhatsApp/email); ticket audit trail; CSAT.
- Integrate with billing (e.g. dunning → ticket) and the audit log.

## 4. External Integrations phase 🔜

(Foundation documented in `INTEGRATION.md`; **not started** by request.)

- **Inbound REST API** — per-company API keys (hashed, scoped, revocable);
  rate-limited; create/update entities via the Entity Registry.
- **Outbound webhooks** — HMAC-signed events (customer/invoice/payment/…),
  retries with backoff, delivery logs.
- **Mapping templates for sync**, scheduled sync jobs, external-ERP import,
  accounting/BI export.
- **OAuth** for third-party apps; integration logs as audit trail.

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
