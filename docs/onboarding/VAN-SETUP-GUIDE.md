# Van Setup Guide

A van is a **mobile warehouse** assigned to a rep. The van-sales loop requires
every selling rep to have an **active van assigned to them** with **opening
stock loaded**.

## 1. Create the van warehouse

Import `templates/02-warehouses.csv` (rows with `is_van=true`) or Settings →
Warehouses → New:

```
branch_ref,code,name,name_ar,location,is_van
CAI,VAN-CAI-01,Cairo Van 01,سيارة القاهرة 01,,true
```

- `is_van = true` is what makes it a van.
- One van per rep is the simplest model; name them per route (`VAN-<BRANCH>-NN`).

## 2. Assign the van to its rep

The `erp_van_sell` / `erp_van_return` RPCs use the rep's **own** assigned van
(`assigned_to = the rep's user`). Set this in **Settings → Warehouses** (or the
van/route admin screen): set the van's **assigned rep** to the salesman who
drives it.

- A van with no assigned rep → the rep gets *"No van assigned"* on sell/return.
- Re-assigning a van (e.g. rep change) is instant and non-destructive.

## 3. Link the van to a route (recommended)

Routes carry the rep + van + working days and drive journey plans. Import
`templates/05-routes.csv`, then ensure each route's rep and van match:

```
code,name,name_ar,city,status,region_ref,branch_ref
RT-CAI-A,Cairo Route A,خط القاهرة أ,Cairo,active,,CAI
```

Customers are linked to a route via `route_id` (the route **name**) in
`templates/06-customers.csv`, which also stamps the serving salesman.

## 4. Load opening stock onto the van

Two ways — pick one:

**A. Opening-stock import (fastest for go-live):** import
`templates/08-opening-stock.csv` with the van as `warehouse_ref`:

```
warehouse_ref,product_ref,quantity,reserved_qty
VAN-CAI-01,BEV-001,200,0
```

**B. Transfer from the main warehouse (ongoing replenishment):** create a stock
transfer (main → van) and complete it, or use **Confirm Load** in the rep's My
Day flow. This is the day-to-day method after go-live; opening-stock import is
for the initial load.

> Keep the **van stock unit = sales unit** (one base UoM per SKU). Mismatched
> units are the most common readiness blocker.

## 5. Policy: negative stock & discount cap

In **Van Sales Settings** (`erp_van_sales_settings`):
- `allow_negative_van_stock = false` (recommended — blocks overselling the van).
- `discount_cap_pct` — the max line discount a rep may apply (e.g. 15%).
- `require_physical_count_on_close = true` — forces a day-end count for reconciliation.

## 6. Verify (per rep)

- [ ] Van exists with `is_van=true`, **active**, **assigned** to the rep.
- [ ] Van has opening stock for every SKU the rep will sell.
- [ ] Route links the rep + van; customers on the route reference it.
- [ ] Readiness Diagnostic (`/field/van-sales/readiness`) shows the van as
      assigned + stocked.

Next: [Pricing Setup Guide](./PRICING-SETUP-GUIDE.md).
