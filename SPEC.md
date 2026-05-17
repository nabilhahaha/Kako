# Near Expiry Registration System — FINAL SPEC v2.0
Roshen KSA × Relia Distribution

## Overview
Mobile-first bilingual (Arabic + English) React web app for tracking near-expiry FMCG products.
3-tier approval workflow: Salesman → Trade Marketing → Roshen Manager (final + email).

## Stack
- React 18 + Vite + Tailwind CSS
- SheetJS (xlsx) for Excel parsing
- EmailJS loaded via CDN
- localStorage only — no backend
- Deploy: Vercel / Netlify

## Roles
| Role | Password | Responsibilities |
|---|---|---|
| salesman | rep123 | Register near-expiry items + suggest action + track |
| trade_marketing | tm123 | Review + pick action OR "no action" (closes here) |
| roshen_manager | rm123 | Upload Excel + final decision + send email + edit within 48h |

## 4 Actions
- `promo_1_1` (1+1 / عرض 1+1)
- `promo_2_1` (2+1 / عرض 2+1)
- `pull_resell` (Pull & resell / سحب البضاعة وإعادة بيعها)
- `no_action` (No action / لا يوجد إجراء) — closes at TM stage

## Status Flow
```
Salesman submits with advisory suggestion
  → pending_tm
TM picks action:
  no_action → closed_no_action (STOPS)
  others   → pending_roshen
RM picks final action → approved + email sent
  → editable for 48h (each edit = new email with different subject)
  → after 48h: locked
```

## Excel Data
Columns: Sales Man, Cust Account, Cust Name, Item Id, Item Description, Inv Qty Cases.
Aggregate: Net Qty = SUM(Inv Qty Cases) per (Salesman + Customer + Item).
Only show items where Net Qty > 0.

## Storage Keys
- `nex_lang` — "ar" | "en"
- `nex_agg` — aggregated salesman→customer→items tree
- `nex_subs` — array of submissions (no photos)
- `nex_pe_{id}` — expiry photo (base64)
- `nex_pq_{id}` — quantity photo (base64)
- `nex_ecfg` — EmailJS config

Full spec retained in commit history.
