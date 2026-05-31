# VANTORA — FMCG Distribution Pilot Package

> **Pilot enablement & customer-validation guide.** Built strictly on the approved
> baseline (`PLATFORM-REVIEW.md`, `COMMERCIAL-LAUNCH.md`, `COMPLETION-REPORT.md`).
> **No new development** — this is a setup, seed-data, and validation plan using
> the platform's existing modules, roles, entities, Import Engine, and (optional)
> ERP adapters. Sample data below is illustrative; load it via the existing Import
> Engine (Excel/CSV) into the seeded demo/pilot tenant. Coexistence is optional
> per pilot and uses the existing adapters with default presets.

---

## 1. Demo company setup

- **Tenant:** create a company **"VANTORA FMCG Demo"** (or the pilot customer's
  name), **business type = `wholesale`** (or `delivery`) — both seed the full
  field + warehouse role/module set.
- **Modules to enable** (via Setup Wizard → Marketplace; all already entitled at
  Professional+): **Sales, Inventory, Purchasing, CRM, Analytics, Field Ops,
  Workflow** (+ **Distribution** vertical for routes/journey/settlement;
  **Wholesale** if tiered pricing is in scope).
- **Setup wizard answers:** size = "Full company (branches/warehouses)";
  "field sales reps? = Yes" (enables rep app, routes, collection, `field_ops`);
  tiered wholesale = Yes/No per customer.
- **Suggested roles step:** accept the seeded distribution roles (§7), editable
  later in Settings → Permissions.
- **Locale:** Arabic-first + RTL toggle; EGP (or the pilot's GCC currency).
- **No code or schema change** — configuration only.

---

## 2. Sample customers (load via Import Engine → `customer`)

| code | name | city | tier (optional) | credit_limit |
|---|---|---|---|---|
| CUST-001 | Nile Mini-Market | Cairo | retail | 20,000 |
| CUST-002 | Delta Wholesale Foods | Tanta | wholesale | 150,000 |
| CUST-003 | Alex Grocery Chain | Alexandria | semi_wholesale | 80,000 |
| CUST-004 | Giza Cash & Carry | Giza | wholesale | 120,000 |
| CUST-005 | Maadi Corner Shop | Cairo | retail | 15,000 |
| CUST-006 | Upper Egypt Distributors | Assiut | wholesale | 200,000 |
| CUST-007 | Suez Retail Hub | Suez | semi_wholesale | 60,000 |
| CUST-008 | Mansoura Market | Mansoura | retail | 25,000 |

Fields map to the existing `erp_customers` (code, name, name_ar, phone, email,
city, credit_limit, external_id). Assign tiers via the Wholesale screens if tiered
pricing is enabled.

---

## 3. Sample products (load via Import Engine → `product`)

| code | name | unit | cost_price | sell_price | barcode |
|---|---|---|---|---|---|
| SKU-1001 | Cooking Oil 1L | bottle | 38.00 | 45.00 | 6221000010012 |
| SKU-1002 | Sugar 1kg | bag | 22.00 | 27.00 | 6221000010029 |
| SKU-1003 | Rice 5kg | bag | 120.00 | 140.00 | 6221000010036 |
| SKU-1004 | Pasta 400g | pack | 9.00 | 12.00 | 6221000010043 |
| SKU-1005 | Tomato Paste 380g | can | 11.00 | 15.00 | 6221000010050 |
| SKU-1006 | Black Tea 250g | pack | 28.00 | 35.00 | 6221000010067 |
| SKU-1007 | Instant Coffee 100g | jar | 55.00 | 68.00 | 6221000010074 |
| SKU-1008 | Bottled Water 1.5L | bottle | 3.50 | 5.00 | 6221000010081 |
| SKU-1009 | Powdered Milk 1kg | pack | 145.00 | 170.00 | 6221000010098 |
| SKU-1010 | Biscuits 200g | pack | 7.00 | 10.00 | 6221000010104 |

Maps to `erp_products_catalog`. Optional tiered prices per SKU via the Wholesale
price screens (retail / semi_wholesale / wholesale).

---

## 4. Sample sales routes (Distribution → Routes + Journey)

| route | rep | day(s) | customers (stops) |
|---|---|---|---|
| R1 — Cairo Central | Salesman A | Sun / Tue / Thu | CUST-001, CUST-005 |
| R2 — Delta | Salesman B | Mon / Wed | CUST-002, CUST-008 |
| R3 — Alexandria | Salesman C | Sun / Wed | CUST-003, CUST-007 |
| R4 — Upper Egypt | Salesman D | Tue / Thu | CUST-006 |
| R5 — Giza C&C | Salesman A | Mon / Thu | CUST-004 |

Configure routes + journey plans in the Distribution section; reps execute via
the **rep app** (`/rep`) → visit → van sale → collection → daily settlement
(`/sales/settlement`).

---

## 5. Sample warehouses (Settings → Branches/Warehouses)

| code | name | branch | role |
|---|---|---|---|
| WH-MAIN | Main Depot | HQ | primary stock, goods receipt |
| WH-CAI | Cairo Hub | Cairo branch | regional distribution |
| WH-ALX | Alexandria Hub | Alexandria branch | regional distribution |
| WH-VAN1 | Van Stock — Rep A | HQ | mobile (van) stock |
| WH-VAN2 | Van Stock — Rep B | HQ | mobile (van) stock |

Use **stock transfers** (`/inventory/transfers` → `erp_complete_transfer`) to load
van warehouses from the depot. Opening balances via Import Engine or stock
adjustment.

---

## 6. Sample dashboards (existing per-vertical KPIs)

The distribution/wholesale dashboard already surfaces (from the setup profile):
- **Today Visits** · **Sales Orders** · **Active Routes** · **Stock Risk** ·
  **Collection** (per the WHOLESALE profile KPIs).
- **Analytics module**: sales report (`/sales/report`), distribution report
  (`/distribution/report`), rep targets (`/distribution/targets`).
- **Approvals** (Workflow): credit-limit / discount approvals.

No new dashboards built — these ship with the distribution vertical + Analytics.

---

## 7. User roles (seeded for wholesale/delivery business types)

| Role | Key | Core permissions (from baseline) |
|---|---|---|
| Admin | `admin` | all |
| Manager | `manager` | all |
| Sales Supervisor | `supervisor` | sell, discount, collect, return, customers, inventory view, approve loading, reports |
| Salesman (rep) | `salesman` | sell, collect, customers, inventory view, stock request, **field.sales** |
| Driver | `driver` | sell, collect, customers, inventory view, stock request, **field.sales** |
| Warehouse Keeper | `warehouse_keeper` | inventory view/adjust/transfer/count, approve loading, purchasing |
| Accountant | `accountant` | accounting view/post, reports, suppliers, collect |
| Viewer | `viewer` | reports, accounting view, inventory view |

Seeded automatically on company creation (`erp_seed_company_roles`); surfaced in
the wizard's Suggested Roles step; fully editable in Settings → Permissions.

---

## 8. Pilot success criteria

- **Adoption:** reps log in daily and execute journeys via the rep app; ≥80% of
  planned visits recorded.
- **Order flow:** van sales → invoices created; (coexistence) orders sync **out**
  to the ERP; customers/products/stock sync **in**.
- **Collection & settlement:** daily rep settlement balances; collection visible
  in dashboards.
- **Inventory accuracy:** van/depot stock reconciles after transfers + sales.
- **Workflow:** at least one credit-limit/discount approval routed and resolved.
- **Visibility win:** management can see routes, sales, collection, stock risk in
  near-real-time (the measurable improvement vs. the status quo).
- **Sign-off:** customer confirms the pilot met its goals → conversion to paid
  annual + reference/case study.

---

## 9. 30-day pilot plan

| Phase | Days | Activities |
|---|---|---|
| **Setup & seed** | 1–5 | Create tenant; enable modules; import customers/products; configure warehouses, routes, journey plans; set roles; (if coexistence) connect the ERP sandbox adapter + validate two-way for agreed entities. |
| **Train** | 6–10 | Role-based training: managers (dashboards/approvals), reps (rep app/journey/settlement), warehouse (transfers/receipts), accountant (collection/reports). |
| **Pilot run — week 1** | 11–17 | Reps run real journeys; daily van sales + settlements; monitor adoption; daily check-in; fix config. |
| **Pilot run — week 2** | 18–24 | Full routes live; exercise approvals; (coexistence) confirm order/stock sync cycles; mid-pilot review vs. success criteria. |
| **Measure & convert** | 25–30 | Measure against §8; capture results; coexistence sign-off; present conversion (annual plan + add-ons); agree case study. |

Weekly check-ins throughout; a named implementation contact + priority support
channel for the duration.

---

## 10. Customer onboarding checklist

- [ ] Pilot scope + success criteria agreed and signed (this package).
- [ ] ERP confirmed (SAP ECC-file / S4-OData · Dynamics BC · NetSuite · Odoo) and
      sandbox + (SAP) middleware access arranged — **or** pilot runs standalone.
- [ ] Tenant created (business type wholesale/delivery); plan = Professional+.
- [ ] Modules enabled: Sales, Inventory, Purchasing, CRM, Analytics, Field Ops,
      Workflow (+ Distribution, + Wholesale if tiered).
- [ ] Master data imported: customers, products (+ tiered prices if used).
- [ ] Branches + warehouses (incl. van stock) configured; opening balances loaded.
- [ ] Routes + journey plans configured; reps assigned.
- [ ] Roles assigned (Suggested Roles step); user accounts created per role.
- [ ] (Coexistence) adapter connection created, credentials in Vault, sync jobs
      defined for the agreed entities/directions, two-way validated on sandbox.
- [ ] Dashboards + reports reviewed with management.
- [ ] Training delivered per role; rep app installed (PWA) on rep devices.
- [ ] Go-live date set; weekly check-in cadence + support channel established.
- [ ] Mid-pilot review (day ~18) and final review (day ~28) scheduled.

---

*FMCG Distribution Pilot Package — baseline-only, no new development. Pair with
`COMMERCIAL-LAUNCH.md` §9 (pilot execution) and the FMCG demo environment (§4).
Recommended first step: confirm the customer's ERP and begin live adapter
validation on a sandbox.*
