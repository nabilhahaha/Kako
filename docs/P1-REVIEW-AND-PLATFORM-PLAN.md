# VANTORA — Electrical P1 Review Package + Full Platform Readiness Plan

> Two parts: **(A)** the completed **Electrical P1** build (review package), and
> **(B)** the requested **platform-wide UX / demo-readiness fix plan** (P1/P2/P3,
> all verticals + SaaS admin, not Electrical-only). No architecture rewrite, no
> new ERP adapters, no new business modules.
>
> **Screenshot note (honest):** this environment has **no browser / no egress to
> the app host**, so I cannot capture live screenshots. Part A instead gives the
> exact **demo navigation paths**, the rendered structure of each screen, and live
> data counts proving each screen renders real content. On request I can generate
> static UI mockups (PNG) — but I will not present fabricated "screenshots."

---

# PART A — Electrical P1 (built, verified)

## What shipped (branch `claude/electrical-screens-p1`)
Read-first screens that **surface already-built backend** (migrations 0096/0097) —
no schema, module, or adapter changes.

| Screen | Route | Gate | Shows |
|---|---|---|---|
| **Serial Numbers** | `/electrical/serials` | `electrical.rma` | serial, product, status, warehouse, cost, received |
| **Warranties** | `/electrical/warranties` | `electrical.rma` | product, serial, customer, start, period, end, derived status |
| **RMA** | `/electrical/rma` | `electrical.rma` | RMA no., customer, product, serial, reason, status, date |
| **Supplier Returns** | `/purchases/returns` | `purchasing.return` | return no., supplier, reason, amount, status, date |

- **Navigation:** new **Electrical** section (Serials / Warranties / RMA) gated
  purely by `electrical.rma` — which migration 0097 seeds **only to electronics
  tenants**, so it is **pack-scoped** and never appears for other verticals.
  Supplier Returns added under **Purchasing**.
- **Dashboard widgets** (shown only with `electrical.rma`): **Active Warranties ·
  Open RMAs · Serialized Products · Supplier Returns**, each linking to its screen.
- **Integrations landing cleaned:** "Coming Soon" placeholder tiles removed; Data
  Import now links to the live Import Engine. Demo-clean.
- **i18n:** new `electrical` namespace (ar/en parity verified) + nav labels.
- **Patterns:** server components, read-only, empty states, RTL, bilingual,
  matching the existing `inventory/expiry` screen convention.

## Verification
- `tsc` clean · `next build` clean (all 4 routes compiled) · full suite **287
  passed / 10 skipped**; new nav-gating tests (pack-scoped electrical, supplier
  returns).
- **Live re-audit (Demo Electric tenant, read-only):** Serials **500** (440 in
  stock) · Warranties **20** (20 active) · RMA **10** (9 open) · Supplier Returns
  **0** · `electrical.rma` granted to 3 roles · `purchasing.return` to 2 roles →
  the nav, screens, and widgets render with real data and are correctly scoped.
- **Gap:** Supplier Returns has **0 rows** in the demo → screen shows a clean
  empty state but nothing to *demonstrate*. Recommend adding a few sample purchase
  returns to the demo seed (demo-data only).

## Demo navigation paths (Electrical)
1. **Login as a Demo Electric admin** → Dashboard shows the 4 Electrical widgets.
2. **Serial Numbers:** sidebar → *Electrical → Serial Numbers* (`/electrical/serials`).
3. **Warranty lookup:** sidebar → *Electrical → Warranties* (`/electrical/warranties`).
4. **RMA:** sidebar → *Electrical → RMA* (`/electrical/rma`).
5. **Supplier Returns:** sidebar → *Purchasing → Supplier Returns* (`/purchases/returns`).
6. **Multi-tier pricing:** sidebar → *Wholesale* screens (already present).

## Demo-data cleanup (held for approval)
`supabase/demo/demo_tenant_cleanup.sql` — **non-destructive, reversible**
(`is_active=false`) archive of junk/test tenants; keeps one clean tenant per
vertical with **Demo Electric** primary. **Not applied** — production apply held
for your approval.

---

# PART B — Full platform-wide readiness fix plan

> All verticals + SaaS admin + customer-facing UX. Classified **P1 (before first
> customer demo) · P2 (before first pilot) · P3 (v1.1)**. Constraints: no
> architecture rewrite, no new adapters/modules, minimal production change.

## P1 — Before first customer demo

| # | Item | Area | Notes |
|---|---|---|---|
| 1 | **Electrical screens** (Serials/Warranty/RMA/Supplier Returns) | Electrical | ✅ **DONE** (Part A) |
| 2 | **Electrical dashboard widgets** | Electrical | ✅ **DONE** |
| 3 | **Hide "Coming Soon" integration tiles** | Integrations | ✅ **DONE** |
| 4 | **Demo tenant cleanup** (archive junk, 1 per vertical, Demo Electric primary) | Demo | Script ready; **apply on approval** |
| 5 | **Electrical default roles + "Show all roles"** | Roles UX | In PR #54 (merge) |
| 6 | **Add sample Supplier Returns to the demo seed** | Demo | So `/purchases/returns` has content |
| 7 | **Per-vertical "simple demo" cheat-sheets** (one core scenario each) | Demo | FMCG=invoice · Electrical=invoice+serial+warranty+RMA · Clinic=visit · Pharmacy=sale+expiry · Restaurant=order+pay · Salon=appt+invoice · Laundry=order+status (docs, not code) |
| 8 | **Consistent Back button** on detail/sub screens | UX | Add a shared `<BackLink>` to detail pages lacking one |
| 9 | **Mobile + RTL visual spot-check** on demo screens (POS, rep app, dashboard, invoice, new electrical screens) | Mobile/RTL | Manual pass on a device; fix any overflow |

## P2 — Before first pilot

| # | Item | Area |
|---|---|---|
| 10 | **Group Platform-Owner per-company toggles** into Core Modules / Industry Packs / ERP Integrations (reuse `classifyModuleKey`) | Super Admin |
| 11 | **Per-company ERP-connector allow-list** (which of CSV/SFTP·Dynamics·SAP·Odoo·NetSuite a tenant may use) | ERP coexistence |
| 12 | **Owner per-company integrations view** (read-only audit on company-detail) | Super Admin |
| 13 | **Companies list polish** — show is_active/suspended clearly; filter "active demos"; quick search | Super Admin |
| 14 | **Built-feature visibility map** — ensure every built feature is reachable from the right admin location (audit checklist → fix gaps) | SaaS admin |
| 15 | **Empty-state pass** across all list screens (consistent illustration + primary CTA) | UX |
| 16 | **Clear button labels** audit (verb-first, consistent) across forms | UX |

## P3 — VANTORA v1.1

| # | Item | Area |
|---|---|---|
| 17 | **Cash Customer workflow** (walk-in sale without a saved customer) | Sales UX |
| 18 | **Global Search** (entities: customers/products/invoices/serials) | Platform UX |
| 19 | **Quick Actions** menu (new invoice / new customer / new RMA) | Platform UX |
| 20 | **Feature Flags** (per-company toggles beyond modules) | SaaS admin |
| 21 | **Impersonation / "View as Company Admin"** for the Platform Owner (read-only, audited) | Super Admin |
| 22 | **Company-admin-scoped permission editor** (today owner-only) | Roles UX |
| 23 | **Role-template admin UI** (`erp_business_type_roles` without migrations) | Super Admin |
| 24 | **Dashboard layout polish** per vertical (focused widgets, less clutter) | UX |

## Vertical demo readiness (target = one simple scenario each)

| Vertical | Core scenario | Status | P1 action |
|---|---|---|---|
| FMCG Distribution | Sales invoice | ✅ ready | curate demo tenant |
| Electrical | Invoice + serial + warranty + RMA | ✅ **now ready** (Part A) | add sample supplier returns |
| Clinic | Patient visit / consultation | ✅ ready | curate demo tenant |
| Pharmacy | Sale + stock/expiry | ✅ ready | curate demo tenant |
| Restaurant/Café | Order + payment | ✅ ready | curate demo tenant |
| Salon | Appointment + service invoice | ✅ ready | curate demo tenant |
| Laundry | Order + pickup/delivery status | ✅ ready | curate demo tenant |

## SaaS admin readiness (Scope 2/5 summary)
- **Supported today:** all-tenant view, suspend/reactivate, subscription/plan/
  trial/expiry, per-company modules, **per-company role permissions + custom
  role**, granular platform-staff permissions, audit logs, provider controls
  hidden from customers.
- **P2 additions:** group toggles (Core/Packs/Integrations), per-company connector
  allow-list, owner integration view, Companies-list polish.

## Company-admin readiness
- **Supported today:** own-company scope, user management, role assignment,
  enabled-only screens, no provider controls.
- **P3 addition:** optional company-scoped permission editor.

---

## Recommended next step
Merge the Electrical P1 work (after your review), apply the demo-cleanup script
(on approval), add the sample supplier-returns seed, then proceed P2. The
platform-wide P2/P3 items are tracked above and require no architecture change.

*P1 build complete + verified. No production data changed (demo-cleanup held for
approval). This document is the review package + the full-platform plan.*
