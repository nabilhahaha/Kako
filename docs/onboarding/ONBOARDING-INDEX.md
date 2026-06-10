# VANTORA — Distributor Onboarding Package

Everything needed to take a **new FMCG distributor live on VANTORA in the
shortest certified time**, built on the certified pilot package and the reference
tenant. Online-first, behind `KAKO_VAN_SALES` (default OFF) + a per-company
toggle.

> **Typical go-live: 2–4 working days** with clean master data, following the
> checklist below.

---

## Start here

1. **[First Real Customer Deployment Plan](./FIRST-CUSTOMER-DEPLOYMENT-PLAN.md)** —
   the dated, owned, measurable plan to deploy to the **first real distributor**
   and **capture real-world feedback** (selection, RACI, timeline, Go/No-Go,
   hypercare, feedback engine, success metrics, decision gate). **Read this first.**
2. **[Distributor Onboarding Checklist](./DISTRIBUTOR-ONBOARDING-CHECKLIST.md)** —
   the end-to-end, stop-at-first-✗ build/activation runbook the plan executes.

## Setup guides (linked from the checklist)

| Guide | Covers |
|---|---|
| [Branch Setup](./BRANCH-SETUP-GUIDE.md) | Branch structure, codes, warehouses, regions |
| [Van Setup](./VAN-SETUP-GUIDE.md) | Van warehouse, rep assignment, route link, opening load, policy |
| [User Onboarding](./USER-ONBOARDING-GUIDE.md) | Role mapping, bulk import / invite, multi-branch, passwords, visibility |
| [Pricing Setup](./PRICING-SETUP-GUIDE.md) | Base price + tax, resolution order, lists/rules, discount cap, credit |
| [Pilot Support Playbook](./PILOT-SUPPORT-PLAYBOOK.md) | Cadence, triage, common fixes, escalation, rollback, exit criteria |

## Import templates

[`templates/`](./templates/) — CSV templates with headers matching the in-app
importer (Settings → Import), example rows mirroring the reference tenant, and a
[README](./templates/README.md) with the **import order** and field notes.

| Order | Template | Entity |
|---|---|---|
| 1 | `templates/01-branches.csv` | Branches |
| 2 | `templates/02-warehouses.csv` | Warehouses + vans |
| 3 | `templates/03-products.csv` | Products |
| 4 | `templates/04-suppliers.csv` | Suppliers |
| 5 | `templates/05-routes.csv` | Routes |
| 6 | `templates/06-customers.csv` | Customers |
| 7 | `templates/07-users.csv` | Users |
| 8 | `templates/08-opening-stock.csv` | Opening stock |
| 9 | `templates/09-journey-plans.csv` | Journey plans |
| — | `templates/feedback-log.csv` | Pilot feedback log (capture, not import) |

## Built on the certified package

| Need | Reference |
|---|---|
| Go/No-Go · Day-1 · Week-1 · Failure-Recovery · Rollback | [`../architecture/fmcg/PILOT-LAUNCH-PACKAGE.md`](../architecture/fmcg/PILOT-LAUNCH-PACKAGE.md) |
| Org / role / permission / master-data / workflow matrices | [`../architecture/fmcg/REFERENCE-COMPANY.md`](../architecture/fmcg/REFERENCE-COMPANY.md) |
| Pilot & reference-tenant certifications | [`../architecture/fmcg/FMCG-PILOT-CERTIFICATION.md`](../architecture/fmcg/FMCG-PILOT-CERTIFICATION.md) · [`REFERENCE-TENANT-CERTIFICATION.md`](../architecture/fmcg/REFERENCE-TENANT-CERTIFICATION.md) |
| Repeatable validation (suite + SQL) | [`../architecture/fmcg/REGRESSION-VALIDATION-GUIDE.md`](../architecture/fmcg/REGRESSION-VALIDATION-GUIDE.md) |
| Recreate / clone the reference tenant | [`../architecture/fmcg/CLONE-REFERENCE-TENANT.md`](../architecture/fmcg/CLONE-REFERENCE-TENANT.md) |
| Full handover index | [`../architecture/fmcg/HANDOVER-INDEX.md`](../architecture/fmcg/HANDOVER-INDEX.md) |

---

## The shortest path (TL;DR)

1. Dedicated project, company created, `KAKO_VAN_SALES=1`.
2. Import **branches → warehouses/vans → products → suppliers → routes →
   customers → users → opening stock → journey plans** (Settings → Import).
3. Set **VAT + base price** per SKU; assign **vans to reps**; **approve customers**.
4. Turn on the **per-company toggle**; run the **Readiness Diagnostic** → READY.
5. Run **one supervised dry-run** on a device → all green.
6. **Go live**; run the [Support Playbook](./PILOT-SUPPORT-PLAYBOOK.md) cadence.
   Rollback is one switch.
