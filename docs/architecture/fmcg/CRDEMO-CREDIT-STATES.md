# Demo credit-state customers (CRDEMO-*) — review data + revert

Seeded **only** on the staging pilot tenant **VANTORA Pilot FMCG (DEMO)**
(`612af0bd-…`), branch **PILOT** (`bebc3635-…`), to let the Collection-in-Sell
credit-control UX be reviewed across every status. **Nothing existing was
modified** — these are 5 new customers (codes prefixed `CRDEMO-`) plus a few
unpaid invoices. Fully revertible (script below).

## What was created

5 customers (all `is_approved`, in the salesman’s van branch so they appear in Van-Sell):

| Code | Status shown | credit_limit | balance | terms (days) | Open invoices | Notes |
|------|--------------|-------------:|--------:|-------------:|--------------:|-------|
| `CRDEMO-GOOD` | 🟢 Good | 20,000 | 2,000 | 30 | 1 (5d old) | available 18,000 |
| `CRDEMO-NEAR` | 🟡 Near credit limit | 5,000 | 4,600 | 30 | 1 (6d old) | available 400 (< 10% = 500) |
| `CRDEMO-OVER` | 🔴 Over credit limit | 5,000 | 6,250 | 30 | 2 (3–8d old) | exceeded by 1,250 |
| `CRDEMO-DUE` | 🔴 Overdue | 20,000 | 3,100 | 30 | 1 (**47d old**) | overdue amount 3,100; oldest 47d |
| `CRDEMO-CASH` | 💵 Cash only | 0 | 0 | 0 | 0 | fully-paid only |

Supporting invoices: `CRDEMO-GOOD-1`, `CRDEMO-NEAR-1`, `CRDEMO-OVER-1`,
`CRDEMO-OVER-2`, `CRDEMO-DUE-1` (status `issued`, unpaid, tax/discount 0).

## What to look for

- **GOOD / NEAR** → sale proceeds; NEAR shows the amber warning + available credit.
- **OVER / OVERDUE / CASH** → on the Payment step any **credit/partial** remainder
  is blocked (“Credit sales are blocked. Collection or full cash sale only.”),
  **full-cash** still issues. OVER/OVERDUE show the **debt snapshot** (outstanding,
  overdue, open invoices, oldest age) and the **Collect Now** button → outstanding
  invoices auto-load in Collection.

## Revert (run on staging when review is done)

Removes the demo customers and **all** their transactions (incl. any sales /
collections created during review) and restores van stock:

```sql
with cust as (select id from erp_customers where code like 'CRDEMO-%')
-- collection allocations (by invoice and by collection)
delete from erp_collection_allocations
 where invoice_id in (select id from erp_invoices where customer_id in (select id from cust))
    or collection_id in (select id from erp_collections where customer_id in (select id from cust));
delete from erp_collections where customer_id in (select id from cust);
delete from erp_invoice_lines
 where invoice_id in (select id from erp_invoices where customer_id in (select id from cust));
delete from erp_stock_movements
 where reference_type = 'invoice'
   and reference_id in (select id from erp_invoices where customer_id in (select id from cust));
delete from erp_invoices where customer_id in (select id from cust);
delete from erp_customers where code like 'CRDEMO-%';
```

No code, schema, or flag changes are involved — this is staging review data only.
