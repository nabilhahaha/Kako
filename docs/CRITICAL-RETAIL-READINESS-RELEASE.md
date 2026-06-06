# Critical Retail Readiness — Deployment / UAT Package

**App:** kako-fmcg · **Branch:** `claude/clinic-project-continuation-PqxGD` · **PR:** #123
**Supabase (prod):** `nrvydmkxjnctdlaxdhur` · **Migrations applied:** 0163 → 0166 (additive · idempotent)
**CI status (head `8a7302d`):** 🟢 Typecheck & build · Integration (DB) · Playwright smoke · Staging migrate — all green
**Verification baseline:** 694 unit / 24 integration / i18n parity / schema-health — all passing

> Notation: 🛒 = generic Sales/Inventory modules · 👗 = Fashion store pack (clothing tenants).
> Permissions resolve through roles; a `manager`/`admin` role holds all. The Fashion umbrella `fashion.manage` implies `fashion.sell`/`fashion.inventory`/etc.

---

## 1. Feature map — routes · navigation · permissions

### A) Void Invoice
| Item | Value |
|---|---|
| URL | `/sales/invoices` (Void is an action on an issued, **unpaid** invoice) |
| Navigation | 🛒 **Sales → Invoices** · 👗 **Fashion → Invoices** |
| View permission | `sales.sell` (🛒) / `fashion.sell` (👗) |
| Void permission | **`sales.void`** — seeded to manager-tier roles (9 roles incl. admin/manager/branch_manager) |
| Reverses | stock (inverse `sale_out`), AR/Revenue journal (4100/1200), customer balance, unpaid installment plan |
| Blocked when | invoice is paid (partial/full) or has a completed return → use Returns/refund |

### B) Returns & Exchanges
| Item | Value |
|---|---|
| URL | `/sales/returns` (returns list + create + **Exchange** card) · print: `/sales/returns/{id}/print` |
| Navigation | 🛒 **Sales → Returns** · 👗 **Fashion → Returns/Exchanges** |
| Permission | `sales.return` (🛒) / `fashion.sell` (👗) |
| Return refund | **credit** (Dr 4110 / Cr 1200 + lower balance) or **cash** (Dr 4110 / Cr 1110 + cash-box payout) |
| Guard | invoice-linked **double-return prevention** (cannot return more than sold; item must be on the invoice) |
| Exchange | return old + sell replacement in one tx; price difference settled cash (pay-in/out) or to balance |

### C) Product Editing
| Item | Value |
|---|---|
| URL | `/products` (catalog: name, SKU, barcode, price, cost, category, active) · `/fashion/products` (styles/variants) |
| Navigation | 🛒 **Inventory → Products** · 👗 **Fashion → Products** |
| Permission | edit gated by **any of** `product.create` / `fashion.inventory` / `inventory.adjust` |
| Validations | SKU + barcode **uniqueness** (company-scoped, excludes self) |
| Protections | historical invoice lines never change (price/qty snapshot at sale); deactivate is reversible |

### D) Barcode Label Printing
| Item | Value |
|---|---|
| URL | `/inventory/labels` |
| Navigation | 🛒 **Inventory → Barcode Labels** · 👗 **Fashion → Barcode Labels** |
| Permission | `inventory.view` (🛒) / `fashion.inventory` (👗) |
| Output | batch labels, 40×30 mm thermal-friendly, Code 39 (POS-compatible), name + SKU + barcode + price + size/color |

### Phase-5 inventory (visibility fixed in this release)
| Feature | URL | Navigation | Permission |
|---|---|---|---|
| Inventory Count (opening/monthly/spot) | `/inventory/count` | 🛒 Inventory · 👗 Fashion → Stock Count | `inventory.count` / `fashion.inventory` |
| Stock Adjustments (+approval) | `/inventory/adjustments` | 🛒 Inventory · 👗 Fashion → Stock Adjustments | `inventory.count` / `fashion.inventory` |
| Movement History | `/inventory/movements` | 🛒 Inventory · 👗 Fashion → Stock Movements | `inventory.view` / `fashion.inventory` |
| Variance Report | `/inventory/variance` | 🛒 Inventory · 👗 Fashion → Variance Report | `inventory.view` / `fashion.inventory` |

---

## 2. UAT checklist

> Pre-req: log in as a **manager/owner** (holds `sales.void` + product/inventory perms). Have ≥1 customer, ≥3 active products with stock, ≥1 issued invoice.

### A) Void Invoice
| # | Step | Expected | P/F |
|---|---|---|---|
| A1 | Create + issue an invoice (qty 2 @ 10) | status `issued`, stock −2, balance +20 | ☐ |
| A2 | Click **Void**, leave reason blank | blocked: reason required | ☐ |
| A3 | Void with reason "wrong customer" | status `cancelled`; stock +2 back; balance −20; reversing journal posted | ☐ |
| A4 | Pay an issued invoice, then try Void | blocked: "use returns/refund" | ☐ |
| A5 | Open Audit log | `invoice.voided` entry with reason + actor | ☐ |
| A6 | Non-manager user | Void button hidden | ☐ |

### B) Returns & Exchanges
| # | Step | Expected | P/F |
|---|---|---|---|
| B1 | New Return → pick customer → pick **original invoice** | lines pre-filled, qty capped to returnable | ☐ |
| B2 | Try qty > sold | capped + warning | ☐ |
| B3 | Complete with **credit** | stock restocked; customer balance reduced; `sales_return.completed` audit | ☐ |
| B4 | Complete another with **cash** (open cash session) | cash-box payout recorded; AR untouched | ☐ |
| B5 | Return more than remaining on same invoice | **blocked** (double-return guard) | ☐ |
| B6 | Exchange card: invoice + returned item + replacement + qty/price | stock swapped; price diff settled; `exchange.posted` audit | ☐ |
| B7 | Print return | `/sales/returns/{id}/print` renders document | ☐ |

### C) Product Editing
| # | Step | Expected | P/F |
|---|---|---|---|
| C1 | Edit a product's price/cost/barcode | saved; `product.updated` audit with changed fields | ☐ |
| C2 | Set SKU to an existing code | rejected: "SKU already in use" | ☐ |
| C3 | Set barcode to an existing barcode | rejected: "barcode already used" | ☐ |
| C4 | Open an old invoice referencing the edited product | line price unchanged (historical protection) | ☐ |
| C5 | Deactivate then reactivate | hidden from new sales then restored; audit both | ☐ |
| C6 | User without product perms | edit blocked | ☐ |

### D) Barcode Labels
| # | Step | Expected | P/F |
|---|---|---|---|
| D1 | Open `/inventory/labels`, search a product | appears in list | ☐ |
| D2 | Set copies = 3, add another product copies = 2 | 5 labels render | ☐ |
| D3 | Toggle source SKU/Barcode + price on/off | labels update | ☐ |
| D4 | Click **Print labels** | only label sheet prints (controls hidden); thermal-sized | ☐ |
| D5 | Scan a printed label at POS (`/fashion/sell`) | resolves the product | ☐ |

### Cross-cutting
| # | Check | Expected | P/F |
|---|---|---|---|
| X1 | Mobile (≤390px) | all forms/tables usable | ☐ |
| X2 | RTL (ar) / LTR (en) | correct direction; numbers/dates LTR | ☐ |
| X3 | Tenant isolation | Company A cannot see Company B data | ☐ |
| X4 | No FMCG regression | trade-spend / field modules unchanged | ☐ |

---

## 3. Release notes

**Critical Retail Readiness** (additive · reversible · audited · mobile-first · RTL/LTR · production-safe):

1. **Void Invoice** — manager-only, mandatory-reason void of an issued unpaid invoice; reverses stock, accounting, balance and unpaid installments; invoice preserved (never deleted); blocked once paid/returned.
2. **Returns & Exchanges** — returns now link to the original invoice with a double-return guard; refund as customer credit or cash (cash-box payout); one-step exchange with price-difference settlement; printable return document.
3. **Product Editing** — SKU & barcode uniqueness validation, permission-gated edits (closed a previously-open edit path), full audit trail, reversible activate/deactivate, guaranteed historical-invoice protection.
4. **Barcode Label Printing** — batch, thermal-friendly Code 39 labels (POS-compatible, zero new dependencies) with name/SKU/barcode/price/size/color.

**Visibility fix:** Phase-5 inventory operations (count types, adjustments, movements, variance) **and** the retail flows above were previously hidden/blocked for fashion (clothing) tenants — now surfaced under the Fashion menu and reachable, without duplicating the generic sections.

**Database:** migrations `0165` (void) and `0166` (returns/exchanges) — additive, idempotent, no new foreign keys; already applied to production.

---

## 4. Known limitations

- **Void** is intentionally limited to **unpaid** issued invoices; paid/returned sales reverse via Returns/refund.
- **Cash refund** records a cash-box payout only when a cash session is open (otherwise journal-only).
- **Printable exchange document** is deferred (returns print fully; exchanges are recorded + audited).
- **Product SKU/barcode uniqueness** enforced at the application layer (no DB unique constraint added, to avoid breaking any pre-existing duplicate barcodes in prod).
- **Fashion variant attribute editing** (size/color/image swap) is via the create flow; catalog fields (SKU/barcode/price/cost/active) are editable via `/products`.
- **Barcode label** size is a single 40×30 mm preset.

---

## 5. Recommended next priorities

1. **Printable exchange document** + an exchanges list/report (close the one deferred item).
2. **DB-level barcode uniqueness** — after a one-time prod cleanup of any duplicate barcodes, add a partial unique index `(company_id, barcode) WHERE barcode IS NOT NULL`.
3. **Granular `sales.void` thresholds** — optional second approval for high-value voids (mirror the large-adjustment approval pattern from Phase 5).
4. **Label presets** — multiple thermal sizes + roll/sheet layouts; optional QR.
5. **Fashion inline variant editing** — size/color/image edit directly in `/fashion/products`.
6. **Returns/refund analytics** — reasons, rates, and cash-vs-credit refund reporting for managers.
