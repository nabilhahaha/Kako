# Van Sales — end-to-end demo runbook

End-to-end walkthrough of the Van Sales **loading loop**, from a salesman request to
ledger posting and reporting. The flow is **CI-validated** by
`src/test/integration/van-sales-e2e.test.ts` (runs in the Integration-tests-DB job).

## The loop

```
1. Salesman raises a load request            /field/van-sales/request   → submitStockRequest
        → event 'van_stock_request.submitted'
2. Configurable approval chain (workflow)     Supervisor → [Area Mgr] → [Warehouse] → approved
        → request status flips to 'approved'   (supervisor may adjust approved_qty — before/after audited)
        → NO stock moves here
3. Warehouse loads the approved qty           erp_van_load_manifests (status 'loaded')
4. Salesman confirms the load                 /field/van-sales/confirm   → confirmLoad
        Accept Full / Accept Partial / Reject Full / Accept With Variance
        → erp_van_confirm_load (atomic, validated, idempotent)
5. Ledger posting                             ONLY accepted qty: transfer_out(source) + transfer_in(van)
        → variance flags review; rejected qty never moves; no auto-deduction
6. Variance review (if any)                   Warehouse → Supervisor (workflow) → review_status
7. Reporting                                  /field/van-sales/reports
        requested vs approved vs received · fill rate · delivery accuracy · variance
```

## Enabling the module (per tenant)

`KAKO_VAN_SALES` (platform master switch) is **OFF by default**. To run the demo:

1. Set the env flag `KAKO_VAN_SALES=1` (platform).
2. Company admin enables the tenant at **`/settings/van-sales`** (`is_enabled`) and sets policy
   (require count on close, allow negative van stock, auto-confirm direct loads, discount cap).
3. (Optional) Customise the approval chain / variance review in the **Workflow Builder**; the
   global defaults (`van_stock_request`, `van_load_variance`) apply otherwise.

A tenant is active only when **both** the platform flag and the company toggle are ON.

## What the e2e test asserts

Request 10 → supervisor approves 8 (adjusted) → warehouse loads 8 → salesman accepts 7 (short 1):
- **Ledger:** exactly the accepted **7** moves `src → van` (van on-hand 7, source 100→93).
- **Outcome:** `accept_partial`, `requires_review = true`, `posted_at` set.
- **Reporting:** requested **10** / approved **8** / received **7**; variance vs requested **−3**.

## Screens

| Role | Screen |
|---|---|
| Salesman | `/field/van-sales` (My Day) · `/field/van-sales/request` · `/field/van-sales/confirm` |
| Warehouse | `/field/van-sales/warehouse` (pending confirmations + variance cases) |
| Anyone (reports) | `/field/van-sales/reports` |
| Admin | `/settings/van-sales` (enablement + policy) |

## Remaining before production

Photo capture (gap #4) reuses the field-media path and is pending a small offline-media
generalization (generic `reference_type`/`reference_id`) so confirmation/variance photos attach
without touching the visit-photo flow. Everything else in the loop is in place behind the flag.
