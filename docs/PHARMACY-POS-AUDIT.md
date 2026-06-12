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

## 3e. Purchasing & Reorder (M3 — `/pharmacy/purchasing`)

Low-stock → supplier purchase orders → receive, reusing the platform's proven
purchase-order tables (`erp_purchase_orders`/`_lines`), number sequence
(`erp_next_number`), and the **atomic** receive RPC (`erp_receive_purchase_order`:
goods receipt + stock + AP journal + supplier balance). The pharmacy value-add is
the reorder suggestion engine and one-click, supplier-grouped PO creation.

| Capability | Flag | DB / RPC | Component / Action | Permission | Status |
|---|---|---|---|---|---|
| Reorder suggestions | `pharmacy.purchase_orders` | `erp_pharmacy_reorder_suggestions()` (0284): on-hand ≤ min, suggested = 2× min − on-hand, last cost, preferred supplier (latest batch) | `reorderSuggestions` | `inventory.adjust`/`purchasing.manage` | ✅ |
| One-click POs (per supplier) | same | `erp_next_number` + `erp_purchase_orders`/`_lines` (status `sent`) | `createReorderPurchaseOrders` | same | ✅ |
| Receive in full | same | `erp_receive_purchase_order` (atomic) + `erp_product_batches` row when Batch Tracking on (keeps FEFO/expiry live) | `receivePharmacyPurchaseOrder` | same | ✅ |
| PO list | same | `erp_purchase_orders` (RLS) | `listPharmacyPurchaseOrders` | same | ✅ |

UX: two tabs (**Reorder** / **Purchase Orders**). Reorder is a check-list with
editable order qty + per-row supplier (prefilled from the last batch's supplier);
items without a supplier block submission until one is picked. Creating POs groups
selected lines by supplier and raises one PO each, then flips to the Orders tab.
Receiving is one click and writes batch rows so the new stock is FEFO-pickable.

**Role Coverage:** Owner (`admin`) ✅ · stock/purchasing role
(`inventory.adjust`/`purchasing.manage`) ✅ · cashier without those perms → the
nav item is hidden (flag + perm) and every action returns `no_permission`. The
whole module disappears when `pharmacy.purchase_orders` is OFF for the tenant
(nav `flag` + page redirect + server `feature_disabled`). Enabled for Amty
(Standard template).

## 3f. Prescription → Dispense linkage (M4)

The standalone dispensing register (`erp_pharmacy_dispenses` + `_items`, 0057) is
now **driven from the POS sale**. When a tenant has prescription capture on, the
cashier fills an inline (collapsible) Rx panel — patient, doctor, Rx number,
controlled flag — and on checkout an audited dispense record (`status='done'`) is
written and linked to the created invoice via `invoice_no`, with one item per
cart line (name + qty + price + the FEFO/chosen **batch** for traceability). No
stock is moved by the register (the sale already moved it).

| Capability | Flag | DB | Where | Permission | Status |
|---|---|---|---|---|---|
| Rx capture panel at POS | `pharmacy.prescription_capture` | — | `pos-fast.tsx` (collapsible) | `sales.sell`/`sales.collect` | ✅ |
| Auto dispense record + invoice link | `pharmacy.prescription_capture` | `erp_pharmacy_dispenses.invoice_no` + `_items.batch_number/expiry_date` | `pharmacyCheckout` | seller | ✅ |
| Mandatory Rx | `pharmacy.pos_prescription_required` | — | `canSell` gate (patient + Rx/doctor) + server writes record unconditionally | seller | ✅ |
| Invoice column in register | `pharmacy.prescription_capture` | `invoice_no` | `/pharmacy/dispense` list | `pharmacy.dispense` | ✅ |

UX: the Rx panel is collapsed for a fast walk-in OTC sale and auto-expands +
becomes required only when the tenant mandates prescriptions; Rx state resets
after each sale. The dispense register's Invoice column makes the Rx→sale link
visible and searchable. `prescription_capture` is Standard (configurable per
tenant); the stricter `pos_prescription_required` stays Enterprise. Both enabled
for Amty (`prescription_capture`; `pos_prescription_required` off → optional Rx).

**Role Coverage:** Owner ✅ · Pharmacist/Cashier (`sales.sell`/`sales.collect`)
writes the record on sale ✅ · the register itself is gated by `pharmacy.dispense`.
With `prescription_capture` OFF the panel vanishes and checkout writes no record.

## 3g. Controlled Drug Register enforcement (M5)

A tenant product can be flagged `is_controlled` (0285, on `erp_products_catalog`).
When the tenant has Controlled Drug Tracking on, putting a controlled item in the
cart **forces** the prescription register: patient + Rx number become mandatory,
the Rx panel auto-opens and is marked controlled, and the sale is always written
to the dispense register (`erp_pharmacy_dispenses`) — even if generic prescription
capture is off. `erp_pharmacy_search` now returns `is_controlled` so the POS
enforces it client- and server-side.

| Capability | Flag | DB | Where | Status |
|---|---|---|---|---|
| Mark medicine controlled | `pharmacy.controlled_drug_tracking` | `erp_products_catalog.is_controlled` (0285) | Onboarding checkbox | ✅ |
| Search exposes controlled | same | `erp_pharmacy_search` returns `is_controlled` | POS rows/cart | ✅ |
| Forced Rx on controlled sale | same | — | `canSell` requires patient + Rx no.; line + panel show a red shield | ✅ |
| Always-logged register | same | `erp_pharmacy_dispenses` (is_controlled=true; notes flag if Rx incomplete) | `pharmacyCheckout` (server-authoritative) | ✅ |
| Controlled register view | `pharmacy.dispense` | filter on `is_controlled` | `/pharmacy/dispense` "Controlled only" | ✅ |

Server is authoritative: even if the client is bypassed, `pharmacyCheckout`
re-derives controlled lines from the catalog, writes the register, and records a
`controlled_incomplete` audit flag when patient/Rx are missing (the sale is
already committed; the gap is logged, not silently dropped). Enabled for Amty
(controlled tracking on; 5 demo medicines — tramadol/pregabalin/codeine/etc. —
marked controlled).

**Role Coverage:** Owner ✅ · Pharmacist/Cashier — controlled sale blocked at the
till until patient + Rx captured ✅ · register filterable by `pharmacy.dispense`.
With the flag OFF, the controlled marker is ignored and no enforcement applies.

## 3h. Offline Pharmacy POS (M6)

The till keeps selling when the internet drops. A completed sale is stored
on-device (IndexedDB, `vantora-pharmacy-pos`) with a client-generated idempotency
key and replayed through the same `pharmacyCheckout` when connectivity returns —
so batch decrement, FEFO, the dispense/controlled register and receipt logic all
run server-side exactly as for an online sale, just deferred. Reuses the field
client's `useOnlineStatus`.

| Capability | Flag | DB | Where | Status |
|---|---|---|---|---|
| Offline capture | `pharmacy.offline_pos` | — | `offline-queue.ts` (IndexedDB) | ✅ |
| Safe replay (no double-charge) | same | `erp_pharmacy_pos_idempotency` (0286, unique company+key) | `pharmacyCheckout` short-circuits a seen key | ✅ |
| Auto-drain on reconnect | same | — | `useOnlineStatus` effect → `drainQueue` | ✅ |
| Status + manual sync | same | — | offline/pending banner + "Sync now" | ✅ |

Idempotency is the safety core: `pharmacyCheckout` records the key after a
committed sale and, on replay, returns the stored invoice instead of creating a
second one — so a lost network response can never charge twice. Drain stops at
the first failure (e.g. dropped again) and resumes on the next online event;
receipt printing is skipped while offline (no committed invoice yet). Enterprise
flag, enabled for Amty.

**Role Coverage:** Owner ✅ · Pharmacist/Cashier sells through an outage and the
queue auto-syncs ✅. With the flag OFF, checkout requires connectivity (no queue).
**Note:** the cart, holds, recent panel and queue are device-local; the POS shell
itself still needs to have been loaded (the app is not yet a full installable PWA
shell for pharmacy — first paint requires one online load).

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
