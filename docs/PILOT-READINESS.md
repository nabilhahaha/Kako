# VANTORA — Pilot Customer Readiness Plan (R6 review)

> Review item #6 — **plan for approval**. Consolidates the platform, modules,
> licensing, and integration work into a go-to-market-ready package for first
> pilot customers. Honest about what's **ready now** vs **gaps to close** before
> a paid pilot.

---

## 1. Pilot customer profile

Ideal first pilot:
- **Market:** GCC / Arab market (Arabic-first + RTL is a differentiator).
- **Size:** SMB → mid-market (fast decisions, real but bounded data volume).
- **Vertical:** one of the **mature** verticals (§3).
- **Adoption shape:** wants **module-by-module** value — e.g. starts with Sales +
  Field Ops, or Clinic/Pharmacy operations — not a 12-month full-ERP migration.
- **Coexistence (optional):** may already run an ERP (SAP/NetSuite/Dynamics/Odoo)
  for Finance/Inventory and want VANTORA for front-office — a good showcase of the
  Integrations module (note: a vendor adapter may still be 🔜; file/CSV-SFTP or the
  inbound API can bridge interim).
- **Champion:** an engaged admin/owner who can configure and give feedback.

Avoid for the **first** pilot: heavy custom dev, complex multi-ERP landscapes, or
hard dependency on an unbuilt vendor adapter.

---

## 2. Required modules (minimum to run a pilot)

- **Always:** Platform core (multi-tenant, RLS, users/roles, audit), **CRM**,
  **Analytics (basic)**, and the customer's **industry pack**.
- **By use case:** **Sales** (+POS for retail), **Inventory**, **Field
  Operations** (distribution), **Finance** (if VANTORA-owned), **Workflow &
  Approvals** (credit-limit / trade-spend / onboarding), **Procurement**.
- **If coexisting with an ERP:** **Integrations** module (requires
  `SUPABASE_SERVICE_ROLE_KEY` + `CRON_SECRET` set in the runtime).
- Licensing: provision via plan tier + per-module entitlement + marketplace toggle
  (today: set entitlement via plan-modules + marketplace; automated enforcement is
  the R4 build).

---

## 3. Recommended industry verticals (readiness-ranked)

| Vertical | Readiness | Why |
|---|---|---|
| **Distribution / FMCG** | ✅ strong | Field Ops, routes/van, Sales orders, Inventory, Trade Spend story, Workflow (credit limits) — VANTORA's strongest differentiated narrative + coexistence showcase. |
| **Clinic** | ✅ mature | Reception/doctor/appointments/visits/clinical fields + fees→finance; protected medical features. |
| **Pharmacy** | ✅ mature | POS + Inventory + dispensing + **Egyptian Drug List** (protected). |
| **Retail / Supermarket** | ✅ ready | POS, Inventory, Procurement, Analytics. |
| **Restaurant / Salon / Laundry / Hotel** | 🟡 available | Functional verticals; pilot if the customer fits. |

**Recommended first pilots:** **Distribution/FMCG** (flagship differentiation) and
**Clinic or Pharmacy** (operationally mature, GCC/Egypt demand).

---

## 4. Deployment checklist (per pilot tenant)

**Provision**
- [ ] Create company (Smart Setup Wizard for the chosen business type).
- [ ] Set plan tier + entitle modules + enable in Marketplace.
- [ ] Branding/locale: company name/logo, Arabic/English default, currency,
      country VAT, timezone/weekend.
- [ ] Branches + Organization structure (departments/roles/`reports_to`).
- [ ] Users + role assignment (3-layer permissions); invite the champion as admin.

**Data**
- [ ] Import customers / suppliers / products via Import Engine (xlsx/csv) with a
      saved Mapping Template; define any **Custom Fields** first.
- [ ] Spot-check RLS scoping + a few records.

**Workflows & config**
- [ ] Configure approvals (e.g. credit-limit) via Workflow Builder if needed.
- [ ] Set up reports/dashboards the champion needs.

**Integrations (if coexisting)**
- [ ] Set `SUPABASE_SERVICE_ROLE_KEY` + `CRON_SECRET` in Vercel; verify `/api/v1`
      + sync dispatcher (DB side-effects).
- [ ] Create connection (Vault credential) + sync jobs (entity/direction/mode/
      conflict policy); run-now + verify a run.

**Go-live**
- [ ] Billing: create subscription + first invoice (manual/offline payment for
      pilot — gateways are 🔜).
- [ ] Backup/restore confirmed; Sentry env set; smoke test core flows.

---

## 5. Support model (pilot phase)

- **Roles:** internal **Implementation** staff (onboarding/config) + **Support**
  staff (issues) — both exist in the Platform Staff tier with scoped access.
- **Channels (interim):** email + WhatsApp + scheduled check-ins. *(In-app
  Ticketing module is 🔜 — until then track issues in a shared tracker; in-app
  **Notifications** already exist for workflow/system alerts.)*
- **Onboarding:** guided setup session using the deployment checklist; a runbook
  per vertical.
- **SLA (pilot):** business-hours response; named contact; weekly review;
  feedback loop into the roadmap.
- **Escalation:** Support → Implementation → Platform Owner (audit-logged
  actions).

---

## 6. Demo environment requirements

- [ ] **Seeded demo tenant per recommended vertical** (Distribution/FMCG, Clinic,
      Pharmacy, Retail) with realistic Arabic/English sample data.
- [ ] **Demo accounts** per role (admin, sales rep, clinic reception/doctor,
      pharmacist, finance) to show role-based dashboards + RLS.
- [ ] **Reset/refresh** capability (re-seed without touching real tenants;
      isolated company_ids).
- [ ] **Integrations demo:** a mock REST endpoint + a sample connection/sync job
      to show inbound pull and a webhook delivery.
- [ ] **Design/brand showcase:** `/design` for the premium UI story.
- [ ] Demo data is clearly labeled and **never mixed** with pilot/production
      tenants (separate companies; RLS guarantees isolation).
- *(Decision: seed demo tenants in the **production project as isolated
  companies**, or stand up a **separate demo project**? — §8.)*

---

## 7. Commercial readiness checklist

- [ ] **Pricing finalized** — tier↔module matrix + industry-pack + Integrations
      add-on pricing per currency (depends on **R4 build** + Billing Phase 2).
- [ ] **Billing live** — plan, subscription, invoice, VAT per country (✅ Phase 1);
      **payment collection** = manual/offline for pilot (gateways 🔜).
- [ ] **Licensing enforcement** — entitlement gating in nav/routes/RPCs (R4 build);
      for pilot, manage via plan-modules + marketplace.
- [ ] **Contracts & terms** — pilot agreement, data processing/privacy, SLA,
      Arabic/English.
- [ ] **Data residency / compliance** — confirm region (eu-west-1 today);
      KSA/UAE considerations noted; e-invoicing hooks (ETA built; ZATCA/UAE 🔜).
- [ ] **Success criteria** — agreed pilot KPIs + conversion path to paid.
- [ ] **Onboarding + support** ready (§5); rollback/exit plan.

---

## 8. Gaps to close before a *paid* pilot (tracked)
| Gap | Needed for | Status / plan |
|---|---|---|
| Entitlement enforcement (nav/route/RPC) | Clean module licensing | R4 build |
| Payment gateway | Online collection | Deferred; manual invoicing for pilot |
| In-app Ticketing | Scalable support | Deferred; interim email/WhatsApp |
| Vendor adapter (if ERP coexistence required) | Specific-ERP sync | Build track B2–B5; CSV/SFTP (B1) + `/api/v1` bridge interim |
| Demo environment | Sales/onboarding | Decide isolated-companies vs separate project (§6) |
| CSV/SFTP transport | File-based ERP feeds | **B1 — next build** |

## 9. Finalized decisions (approved)

1. **First pilot targets (4):**
   - **FMCG Distribution company** (flagship — Field Ops + Sales + Inventory +
     Trade Spend + Workflow + coexistence).
   - **Electrical Retail & Wholesale business** (multi-tier pricing, warranty,
     RMA, serials — see the new pack below).
   - **Pharmacy** (POS + Inventory + dispensing + **Egyptian Drug List**).
   - **Clinic** (reception/doctor/appointments/visits + fees→finance).
2. **Demo environments (4):** Distribution Demo · Electrical Retail Demo ·
   Pharmacy Demo · Clinic Demo — seeded, role-based, isolated companies.
3. **Commercial readiness:** platform-first · module-based licensing · industry
   packs as add-ons · **Integrations as a paid module**.
4. **Pilot success criteria:**
   - [ ] Customer onboarding completed.
   - [ ] Real transactions processed.
   - [ ] Reporting validated.
   - [ ] User adoption confirmed.
   - [ ] **No critical production issues.**

### New tracked industry pack — **Electrical Retail & Wholesale Pack**
Add to the industry-pack roadmap (see `ROADMAP.md`). Bundles core modules +
electrical-trade specifics:
- **Multi-tier pricing:** Retail / Half-Wholesale / Wholesale / **Project
  pricing** (per customer tier + project quotes).
- **Warranty tracking** (per item/serial, claim handling).
- **Returns & RMA** (authorize → receive → resolve; ties to warranty).
- **Serial number support** (capture/track serials through purchase→sale→service).
- Core: **Inventory · Purchasing · Accounting/Finance · POS** (+ Sales, CRM).
- Built on the entity framework + custom fields where possible (no per-customer
  forks); pricing tiers via the pricing/wholesale module pattern.

*(Item #6 — finalized/approved. The **build track** now begins: **B1 — CSV/SFTP
Transport**, then **B2 — Dynamics 365 Business Central**.)*
