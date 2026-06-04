# VANTORA — Salesman App Excellence Sprint

> Mobile-first, salesman-first, **additive** improvements. Reuses existing
> entities / RLS / components / navigation. No migrations, no production data
> changes, no AI. Prepared `2026-06-04`.

## GitHub / product patterns inspected (patterns only, no code copied)
- **ERPNext POS / Selling**, **Odoo POS / Sales** — print formats, line-item layout, totals/VAT block.
- **Dolibarr**, **Invoice Ninja**, **Akaunting** — clean printable invoice + customer statement ledger (debit/credit/running balance).
- **OpenBoxes** — stock visibility patterns (on-hand, low/out, expiry).
- **Field-sales / route-sales apps** — one-tap per-customer actions, thumb-zone bottom actions, account statement on the go.
- **POS print templates** — thermal-friendly narrow layout, QR placeholder for e-invoice.

## What shipped
| Area | Status |
| --- | --- |
| **Invoice printing** | ✅ `/sales/invoices/[id]/print` — bilingual, A4 + thermal-friendly, company header (tax/CR no.), bill-to, items, subtotal/discount/VAT/total/paid/balance, QR placeholder, `print:` styles. Reachable from Customer 360 invoice events. |
| **Customer statement printing** | ✅ `/customers/[id]/statement/print` — ledger (invoices = debit, payments = credit), running + outstanding balance, print/export-friendly. |
| **Customer 360 one-tap actions** | ✅ actions bar (New invoice · Print statement · Stock · Customer profile). |
| **Print UX** | ✅ `PrintBar` (sticky, `print:hidden`, thumb-zone), reusable. |
| **Salesman UX polish** | ✅ large tap targets, RTL-aware, empty/defensive states; Arabic-first + English. |

## Stock visibility — partial (documented data gap)
Available stock has a screen (`/inventory`, linked from the actions bar). **Van stock / near-expiry per salesman is NOT exposed as reliable production data** (the van-stock and expiry fields live in later migrations not yet applied to production). Per the rules, **no unsafe schema was invented**. Required to complete:
- Applied `erp_van_*` / journey/stock tables (part of the residual drift closure), and a per-van on-hand read with `low/out/expiry` flags.
- Until then, the actions bar links to the existing `/inventory` (available stock) and the salesman van-stock view is deferred with a safe empty state.

## Documented data gaps (no schema invented)
1. **Opening balance** — not stored separately on `erp_customers`; the statement starts from the first invoice and reconciles to the live `balance`. A true opening-balance field/period would need a migration.
2. **Van stock / near-expiry** — see above.
3. **Returns/credits in the statement** — `erp_sales_returns` is part of the unapplied drift; the ledger currently covers invoices + payments and will include returns once that schema is in production.

## Navigation changes
No new top-level nav item (print/statement are deep routes reached from Customer 360 + invoice lists). Customer 360 gained the one-tap actions bar.

## Validation
`tsc` · `vitest` · `next build` · i18n parity + keys-usage + route integrity — see PR.

## Estimated business value increase
**High for field reps** — printable invoices + on-the-go account statements + one-tap customer actions are core daily-driver capabilities for FMCG van/route sales that were missing; all additive and reuse existing data.
