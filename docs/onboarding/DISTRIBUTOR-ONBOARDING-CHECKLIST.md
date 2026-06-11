# Distributor Onboarding Checklist

The shortest certified path to take a new FMCG distributor live on VANTORA, using
the pilot package and the reference tenant as the template. Work top to bottom;
**stop at the first ✗**. Companion guides are linked per step.

> **Target:** one distributor, 1–3 branches, 1–3 van reps, online-first, behind
> `KAKO_VAN_SALES` (default OFF) + a per-company toggle. Typical time to go-live:
> **2–4 working days** with clean master data.

---

## Phase 0 — Environment (Day 0)

- [ ] **Dedicated project** — a demo/staging Supabase for setup + rehearsal,
      separate from production. `KAKO_VAN_SALES=1`.
- [ ] **Company created** — name, currency, country, tax number, logo (logo shows
      on every printed document).
- [ ] **Reference tenant available** on staging for side-by-side comparison
      (`supabase/pilot/reference-company.sql`).

## Phase 1 — Organization & users  → [User Onboarding Guide](./USER-ONBOARDING-GUIDE.md)

- [ ] **Branches** imported (`templates/01-branches.csv`) → [Branch Setup](./BRANCH-SETUP-GUIDE.md)
- [ ] **Warehouses + vans** imported (`templates/02-warehouses.csv`) → [Van Setup](./VAN-SETUP-GUIDE.md)
- [ ] **Departments / job titles** (optional) created for org clarity.
- [ ] **Users** imported (`templates/07-users.csv`) or invited; **roles + branches assigned**.
- [ ] **Reconciliation owner** confirmed: supervisor / warehouse-keeper (NOT the rep).

## Phase 2 — Master data  → [templates/README](./templates/README.md)

- [ ] **Products** imported (`templates/03-products.csv`); **VAT set** per SKU.
- [ ] **Suppliers** imported (`templates/04-suppliers.csv`).
- [ ] **Routes** imported (`templates/05-routes.csv`); rep + van assigned per route.
- [ ] **Customers** imported (`templates/06-customers.csv`): approved, on-branch,
      `salesman_id`, credit limits, payment terms, GPS.
- [ ] **Journey plans** imported (`templates/09-journey-plans.csv`) — optional but
      recommended for coverage tracking.
- [ ] **Return reasons** present (at least one active).

## Phase 3 — Pricing & tax  → [Pricing Setup Guide](./PRICING-SETUP-GUIDE.md)

- [ ] **Every SKU resolves a positive price** (base `sell_price` or a price list).
- [ ] **One base UoM per SKU**; van stock unit = sales unit.
- [ ] **Tax** configured per SKU (standard VAT / 0% exempt).
- [ ] **Price lists / rules** (optional): wholesale list, customer/segment promos.

## Phase 4 — Stock

- [ ] **Opening stock** loaded into main warehouses (`templates/08-opening-stock.csv`).
- [ ] **Van load** confirmed: each rep's van stocked (transfer or opening stock) → [Van Setup](./VAN-SETUP-GUIDE.md)

## Phase 5 — Activation & rehearsal

- [ ] **Per-company toggle** ON: `erp_van_sales_settings.is_enabled = true`;
      `discount_cap_pct` set; `allow_negative_van_stock = false`.
- [ ] **Readiness Diagnostic** — open `/field/van-sales/readiness` as admin →
      **READY, 0 blockers**.
- [ ] **Supervised dry-run** on a real device: open day → visit → sell → collect →
      return → reconcile → close — all green (mirror of `run-pilot-dry-run.sql`).

## Phase 6 — Go-live & support  → [Pilot Support Playbook](./PILOT-SUPPORT-PLAYBOOK.md)

- [ ] **Day-1 Operations** briefing delivered (every sale/collection/return in-app).
- [ ] **Week-1 Monitoring** dashboard owners assigned (stock accuracy, AR, coverage).
- [ ] **Support + escalation** path agreed; rollback switch understood (one toggle).

---

## Go / No-Go gate (from the certified pilot package)

**GO only when all are TRUE:**
- [ ] `KAKO_VAN_SALES` ON + per-company `is_enabled = true`.
- [ ] Each rep has an **assigned, stocked van**.
- [ ] **Every SKU resolves to a positive price**; one base UoM.
- [ ] Customers approved/on-branch with credit limits; return reasons active.
- [ ] Roles assigned; reconciliation run by supervisor/warehouse-keeper.
- [ ] **Readiness Diagnostic = READY**; **one supervised dry-run passed** on device.
- [ ] Pilot route has adequate connectivity (online-first).

Full Go/No-Go, Day-1, Week-1, Failure-Recovery and Rollback guides:
[`../architecture/fmcg/PILOT-LAUNCH-PACKAGE.md`](../architecture/fmcg/PILOT-LAUNCH-PACKAGE.md).

## Pre-launch hygiene

- [ ] **Branch codes** chosen freely (document numbering is tenant-scoped since
      migration 0268 — codes like `CAI` may coexist with other tenants).
- [ ] **Emails unique** per user. Bulk-imported users set passwords via reset/invite.
