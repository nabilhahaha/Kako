# Pricing Setup Guide

Pricing is **server-authoritative**: `erp_van_sell` prices every line via
`erp_resolve_price`, so the rep cannot sell at the wrong price. Get pricing right
before go-live — **every SKU must resolve to a positive price**, or the Readiness
Diagnostic blocks launch.

## 1. Base price + tax per product (required)

Products carry a base `sell_price` (set via `templates/03-products.csv`). After
import, in **Settings → Products** set each SKU's:
- **`sell_price` > 0** — the default selling price.
- **`tax_rate`** — VAT per SKU (e.g. standard VAT for most FMCG; **0%** for
  exempt basics like water/dairy). Tax is computed on invoices from this rate.
- **One base UoM** — the unit you stock and sell in (keep van stock unit = sales
  unit). Multi-UoM is a later enhancement; start single-UoM.

> `tax_rate` is **not** an import column — set it in the app after importing
> products.

## 2. Price resolution order (how a line price is chosen)

`erp_resolve_price` picks the most specific active rule, else the base price:

1. **Price rules** (`erp_price_rules`) — scoped & prioritized:
   `customer` → `segment` → `channel` → `tier` → `branch`/`region`/`area` →
   `global`. Each is `fixed`, `percent_off`, or `amount_off`, with `min_qty`,
   `priority`, and optional `valid_from/valid_to`.
2. **Price list item** (`erp_price_list_items`) — a fixed unit price per product
   in a named list (e.g. *Wholesale*).
3. **Base `sell_price`** on the product — the fallback.

## 3. Common setups (configure in-app)

| Goal | How |
|---|---|
| **Standard retail price** | Product `sell_price` (the default list mirrors it). |
| **Wholesale list (−8%)** | Create a *Wholesale* price list; add items at the discounted unit price. |
| **Customer promo** (e.g. 10% off a SKU for one customer) | Price rule: scope `customer`, `percent_off` 10, `min_qty` 1. |
| **Volume deal** (e.g. 5% off ≥ 5 cartons) | Price rule: scope `global`/`segment`, `percent_off` 5, `min_qty` 5. |
| **Channel pricing** (HoReCa vs retail) | Tag customers with a `channel`; add channel-scoped rules. |

The reference tenant ships a customer promo (10% off Nile Cola for CUST-001) and
a global volume deal (5% off NuttyMix ≥ 5) — copy those as working examples.

## 4. Discount cap (rep guardrail)

Set `discount_cap_pct` in **Van Sales Settings**. A rep cannot exceed it on a
line; the server rejects over-cap discounts. Typical: 10–15%.

## 5. Credit & payment terms (AR controls)

These live on the **customer**, not pricing, but gate selling:
- `credit_limit` — `erp_van_sell` blocks a sale that would push the customer over
  their limit (collect first or raise the limit).
- `payment_terms_days` — sets invoice `due_date` (Net 0/15/30).

## 6. Verify pricing is launch-ready

- [ ] Every pilot SKU has `sell_price > 0` and a `tax_rate`.
- [ ] One base UoM per SKU; van unit = sales unit.
- [ ] Pick 2–3 SKUs and confirm they **resolve a positive price** (Readiness
      Diagnostic checks this automatically).
- [ ] Any promos/lists tested on a sample sale in the dry-run.
- [ ] Readiness Diagnostic (`/field/van-sales/readiness`) = **READY**.

Next: load stock and run the supervised dry-run — see the
[Onboarding Checklist](./DISTRIBUTOR-ONBOARDING-CHECKLIST.md) Phases 4–5.
