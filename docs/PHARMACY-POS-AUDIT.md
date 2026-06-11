# Pharmacy POS — Feature Inventory, UI Coverage & Role Coverage Audit

Scope: the Fast Pharmacy POS (`/pharmacy/pos`). Verifies there is no gap across
**DB → API → Business Logic → Navigation → UI → Permissions**, and that every
feature obeys its tenant flag (visible/usable when ON, gone when OFF).

Legend: ✅ complete · 🟡 partial / data-dependent · ⛔ gap (tracked).

## 1. Feature Inventory (per POS capability)

| Capability | Flag | DB | API | Logic | Nav | UI | Permission | Status |
|---|---|---|---|---|---|---|---|---|
| Fast search (en/ar/active ingredient/code) | — | `erp_pharmacy_search` + trigram idx (0274/0276) | `pharmacySearch()` | rank: barcode→code→name | item gated | search box + result grid | `sales.sell`/`sales.collect` | ✅ |
| Barcode scan instant-add | `pos_barcode_scan` | barcode col + index | same RPC (exact barcode) | Enter→add top hit | — | scan icon + Enter handler | seller | ✅ (demo data has no barcodes yet) 🟡 |
| Add / qty edit | — | — | — | cart state | — | +/- + qty input | seller | ✅ |
| Stock validation | — | `erp_inventory_stock` | `on_hand` in RPC | block checkout if qty>on_hand | — | red qty + warning | seller | ✅ |
| Cash payment + change | — | `erp_payments` | `pharmacyCheckout`→`quickSale`→`recordPayment` | tendered−net=change | — | method + tendered + change | seller | ✅ |
| Receipt printing | `pos_receipt_printing` | invoice/lines/payment | receipt page query | print only after commit | — | confirm modal + `/print/pharmacy/receipt` (`?autoprint=1`) | seller | ✅ |
| Batch selection | `batch_tracking` | `erp_product_batches` | `pharmacyBatches()` | decrement on checkout | — | per-line batch select | seller | 🟡 logic ready; **no batches until Batch Intake built** |
| FEFO suggestion | `fefo_allocation` | batches by expiry | `pharmacyBatches` ordered expiry | preselect earliest (index 0) | — | "FEFO" tag on first batch | seller | 🟡 same dependency |
| Hold / Resume | `pos_hold_resume` | localStorage (per-device) | — | save/restore cart | — | Hold + Resume(n) list | seller | ✅ |
| Returns | `pos_returns` | existing returns model | `completeReturn`/`cancelReturn` | reuses returns flow | — | Return button → `/sales/returns` | `sales.return` | 🟡 entry point; **batch-aware returns** pending |
| Discount + permission | `pos_discount_approval` | — | line discount_pct | discount hidden unless allowed | — | per-line disc% (managers only) | `pricing.manage`/`sales.discount` | 🟡 permission enforced; **approval-routing** pending |

**Flag-off behaviour (verified by construction):** all advanced controls are
rendered behind `features.*` booleans resolved server-side in `page.tsx`; when a
flag is OFF the prop is `false` and the control (and its handler) is never
rendered — no UI, no logic, no orphan.

## 2. UI Coverage Audit (Amty/City Care config)

Config ON: batch_tracking, expiry, near-expiry, **pos_barcode_scan**,
**pos_hold_resume**, **pos_returns**, **pos_receipt_printing**. OFF: **fefo**,
lot, controlled, expiry-write-off, **pos_discount_approval** (manager-discount).

| Enabled feature | Expected on screen | Present? |
|---|---|---|
| Barcode scan | scan icon, scan placeholder, Enter-to-add | ✅ |
| Hold/Resume | Hold + Resume buttons + held list | ✅ |
| Returns | Return button | ✅ |
| Receipt printing | "Print receipt now?" modal after sale | ✅ |
| Batch tracking | per-line batch dropdown (when product has batches) | ✅ control; ⛔ empty until intake |
| FEFO (OFF) | no "FEFO" preselect/tag | ✅ hidden |
| Discount (cashier, no perm) | no discount input | ✅ hidden |

## 3. Role Coverage Audit

| Role | POS access | Sell | Discount | Returns | Notes |
|---|---|---|---|---|---|
| Pharmacy Owner (`admin`) | ✅ | ✅ | ✅ (`pricing.manage`) | ✅ | full |
| Pharmacist | ✅ (if `sales.sell`) | ✅ | role-dependent | ✅ | same gate as cashier + dispense |
| Cashier | ✅ (`sales.collect`/`sales.sell`) | ✅ | ⛔ hidden (no `pricing.manage`) | ✅ if `sales.return` | speed-first |
| Inventory Manager | nav hidden unless seller perm | — | — | — | manages stock, not POS |

Page guard: `requireAnyPermission(['sales.sell','sales.collect'])`; nav item gated
on the same perms; discount UI gated on `pricing.manage`/`sales.discount`. RLS
scopes all reads/writes to the tenant.

## 4. Gaps tracked before "done"

1. **Barcodes + batches on inventory** — needs the **Catalog Onboarding** +
   **Batch Intake** screens (next milestone) to populate barcodes and
   `erp_product_batches`; until then batch-select/FEFO render but have no data,
   and barcode-scan has nothing to match on the demo set.
2. **Batch-aware returns** — POS links to the generic returns flow; restoring the
   specific batch on return is pending the intake model being in daily use.
3. **Discount approval routing** — discount is permission-gated now; routing an
   over-threshold discount through the approval engine is pending.

These are the immediate inputs for the next milestone (Catalog Onboarding →
Batch Intake), after which the POS batch/FEFO/barcode paths become fully live.
