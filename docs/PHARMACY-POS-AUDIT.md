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

## 3b. Scanning Framework (platform-wide, reusable)

A single enterprise scanner — **not** a pharmacy-only implementation — consumable
by any pack (FMCG sales, warehouse receiving, stock transfer, inventory count,
clinic). `src/components/scanning/scanner.tsx`: camera barcode/QR via the native
`BarcodeDetector` (no dependency) + manual entry that also serves hardware
USB/Bluetooth scanners; continuous mode with duplicate-suppression; auto-refocus
on the consumer's input.

| Scan feature | Flag (platform pack) | DB | Component | Consumer | Fallback | Status |
|---|---|---|---|---|---|---|
| Barcode | `platform.scan_barcode` | `erp_pharmacy_search` (barcode) | search box / scanner | POS | search dialog | ✅ |
| Camera scan | `platform.scan_camera` | — | `CameraScanner` (BarcodeDetector) | POS scan button | manual entry if unsupported | ✅ |
| QR | `platform.scan_qr` | — | same component (`qr_code` format) | (future: customer/doc QR) | — | 🟡 framework ready |
| OCR | `platform.scan_ocr` | — | same `onScan` contract | future | — | ⛔ planned |

**Not-found → link:** an unknown scanned barcode opens a search dialog that links
the code to an existing product (`linkBarcodeToProduct`, permission-gated
`products.manage`/`pricing.manage`, audited) and adds it to the cart.

**Navigation:** no scanning menu — scanning is surfaced only where a process
consumes it (POS scan button, gated by `platform.scan_camera`). Flags live in the
tenant Feature Config (`/settings/features` → Scanning domain) and the UI Coverage
Audit (each scan feature declares `coverage`).

## 3c. Unit Governance Coverage (multi_unit_support)

Per-product unit rules (engine: `src/lib/erp/uom.ts` + `uom-rules.ts`, bridge
`uom-server.ts`) — verified across every surface a unit-enabled product touches.
Inventory invariant: **all stock movements store BASE-unit quantities**; the
audit preserves entered unit + entered qty + base qty (`baseMovement`).

| Surface | Rule enforced | Where | Status |
|---|---|---|---|
| **Catalog** | base / purchase / sales units, `sell_mode`, `allow_fractional`, conversion ratios | `erp_products_catalog` (0277/0278) + `erp_product_uoms` + `/settings/uom` | ✅ storage; 🟡 product-edit fields land with Onboarding |
| **Batch Intake** | receive in purchase/receiving unit → `toBase` → base stock; `validatePurchase` | `uom-rules.validatePurchase` + `baseMovement` | 🟡 engine ready; screen next |
| **POS** | only sellable units (`sellMode`), whole-qty unless `allow_fractional`, price/qty converted to base, stock validated in base | `pharmacyCheckout` (`validateSell`, `toBase`, `priceToBase`, `uom_movement` audit) | ✅ enforced server-side (unit selector UI next) |
| **Inventory** | movements + batch decrements in base units | `pharmacyCheckout` batch decrement uses base qty | ✅ |
| **Reports** | report by base / sales / purchase unit | `stockInUnit` / `lineUnitPrice` helpers | 🟡 helpers ready; report screens next |

Invalid conversions are blocked before any stock math: `validateConversion`
rejects unknown / zero-factor units; `validateSell`/`validateQty` reject
non-sellable units, non-positive and (unless allowed) fractional quantities.
Tests: `uom.test.ts` (7) + `uom-rules.test.ts` (8).

## 3d. Platform Contact Model (reusable, not pharmacy-only)

`erp_customers` is the single contact model: a **Full** business customer (FMCG)
uses the governance fields (CR/VAT/GPS/National Address + approval); a
**Lightweight** contact (pharmacy walk-in, clinic patient, retail/cash POS, quick
reg) uses name (+ optional phone/notes), `contact_mode='lightweight'`, no
governance, no approval. Reusable component `components/contacts/quick-customer.tsx`
+ action `contacts/actions.ts#quickCreateCustomer` — any pack drops it in.

| Capability | Flag (platform) | DB | Component/Action | Permission | Status |
|---|---|---|---|---|---|
| Lightweight customers | `platform.lightweight_customer_mode` | `erp_customers.contact_mode`/`notes` (0282) | quickCreateCustomer | tenant flag | ✅ |
| Inline quick-create | `platform.quick_customer_create` | — | `<QuickCustomerCreate>` | `customers.manage`/`sales.sell`/`sales.collect` | ✅ |

UX: cash customer is the default, selection optional, **+ New** inline by the
selector, name (+ phone) with **Enter-to-save**, **auto-selected** after create,
mobile/tablet friendly. Both flags configurable per tenant in `/settings/features`
(Customers domain); quick-create additionally gated **by role** (permission).

**Role Coverage:** Owner (`admin`) ✅ · Pharmacist/Cashier (`sales.sell`/`sales.collect`) ✅ · a role without those perms → the **+ New** control is hidden and the server rejects creation. When `lightweight_customer_mode` or `quick_customer_create` is OFF for the tenant, the control disappears and the action returns disabled — no FMCG complexity is forced on the pharmacy.

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
