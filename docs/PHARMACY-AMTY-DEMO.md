# Amty Pharmacy (DEMO) — Pilot Tenant

A real-world-usable pharmacy pilot tenant on `vantora-staging`, provisioned with
the full pharmacy stack and the approved Amty feature configuration.

## Logins
Password (all): `Amty#Demo1`

| Role | Email | Member role | Use |
|---|---|---|---|
| Owner | `owner@amty.test` | admin | dashboard, reports, onboarding, receive, features |
| Pharmacist | `pharmacist@amty.test` | cashier | POS, dispense |
| Cashier 1 | `cashier1@amty.test` | cashier | POS |
| Cashier 2 | `cashier2@amty.test` | cashier | POS |

Company: **Amty Pharmacy (DEMO)** · business type `pharmacy` · currency EGP ·
1 branch (Amty Main) · 1 warehouse (Amty Store).

## Seeded data
- **25 medicines** drawn from the Global Egyptian Catalog (linked via
  `medicine_ref_id`, with Arabic name + active ingredient + barcode + price).
- **50 batches** with **varied expiry** → 5 expired + 20 near-expiry (≤30/60/90d)
  so the expiry dashboard and write-off are live; 25 in-stock (50/medicine).
- Action policies seeded; audit + notifications on.

## Feature configuration (Amty spec)
**ON:** batch tracking, expiry tracking, near-expiry alerts, expiry-risk
dashboard, multi-unit support, POS barcode scan, hold/resume, returns, receipt
printing, approval workflows, audit, critical actions, notifications, barcode
scanning, **camera scanning**.
**OFF:** lot tracking, FEFO, expiry write-off workflow, controlled-drug tracking,
barcode-required, POS discount approval, price override, prescription required,
QR/OCR scanning.

## What to test
- **POS** (`/pharmacy/pos`): search by Arabic/English/active ingredient; scan/Enter
  add; hold (F4)/resume (F5)/checkout (F9); cash + change; receipt print; camera scan.
- **Owner dashboard** (`/pharmacy/dashboard`): KPIs (sales/cash/GP/expiry/…).
- **Expiry** (`/pharmacy/expiry`): expired/near buckets (write-off flag is OFF by
  design — toggle it in `/settings/features` to enable the write-off action).
- **Receive** (`/pharmacy/receive`): receive in purchase unit → base stock.
- **Onboarding** (`/pharmacy/onboarding`): add more medicines from the catalog.
- **Reports** (`/pharmacy/reports`): daily sales / by medicine / balance / low /
  dead / returns.
- **Features** (`/settings/features`) + **Action Policies** (`/settings/action-policies`).

## Validated (staging, as the owner)
Dashboard near=20 / expired=5 / low=0; reports inventory_balance=25, dead_stock=25;
search returns hits. All RLS-scoped to the tenant.
