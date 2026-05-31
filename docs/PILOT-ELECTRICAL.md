# VANTORA — Electrical Retail & Wholesale Pilot Package

> **Pilot enablement & customer-validation guide.** Built strictly on the approved
> baseline (`PLATFORM-REVIEW.md`, `COMMERCIAL-LAUNCH.md`, `PACK-ELECTRICAL.md`,
> `PACK-ELECTRICAL-B.md`). **No architecture changes, no new feature development**
> — this exercises the **already-complete Electrical pack** (multi-tier pricing,
> serials, warranty, RMA, supplier + customer returns, serialized transfers) with
> configuration + seed data + a validation plan. Sample data is illustrative; load
> it via the existing Import Engine into the seeded demo/pilot tenant. Coexistence
> is optional and uses the existing adapters with default presets.

---

## 1. Demo company setup

- **Tenant:** **"VANTORA Electrical Demo"** (or the customer's name), **business
  type = `electronics`** — seeds the electrical roles + enables the pack
  (migrations 0096/0097 are live in production).
- **Modules to enable** (Setup Wizard → Marketplace; entitled at Professional+):
  **Sales, Inventory, Purchasing, Finance/Accounting, POS, Analytics** +
  **Wholesale** (tier pricing) + the **Electrical** capabilities (serials /
  warranty / RMA via `electrical.rma`).
- **Setup wizard answers:** size = company; wholesale tiering = Yes (enables tiers
  Retail/Semi-wholesale/Wholesale/Project, seeded for electronics by 0096);
  serialized products + warranty + RMA on.
- **Suggested roles step:** accept the seeded electronics roles (§9), editable in
  Settings → Permissions.
- **Locale:** Arabic-first + RTL; EGP (or the pilot's GCC currency).
- **No code or schema change** — configuration only; the four tiers already seed
  for electronics tenants.

---

## 2. Sample products (Import Engine → `product`)

Set `is_serialized` + `warranty_months` on the high-value SKUs (the pack flag;
non-serialized SKUs behave exactly as today).

| code | name | unit | cost_price | sell_price | is_serialized | warranty_months |
|---|---|---|---|---|---|---|
| EL-2001 | LED Bulb 9W | pc | 18 | 28 | no | — |
| EL-2002 | Copper Cable 2.5mm (100m) | roll | 850 | 1,050 | no | — |
| EL-2003 | Circuit Breaker 32A | pc | 65 | 95 | no | 12 |
| EL-2004 | Distribution Board 12-way | pc | 420 | 560 | no | 24 |
| EL-2005 | Solar Inverter 5kW | pc | 14,500 | 18,900 | **yes** | 36 |
| EL-2006 | Submersible Water Pump 1HP | pc | 3,200 | 4,300 | **yes** | 24 |
| EL-2007 | Voltage Stabilizer 10kVA | pc | 2,800 | 3,650 | **yes** | 24 |
| EL-2008 | Industrial Socket 63A | pc | 140 | 195 | no | 12 |
| EL-2009 | Cable Tray 3m | pc | 210 | 280 | no | — |
| EL-2010 | Smart Energy Meter | pc | 1,150 | 1,580 | **yes** | 24 |

Maps to `erp_products_catalog` (+ the pack columns `is_serialized`,
`warranty_months`).

---

## 3. Multi-tier pricing examples (Wholesale screens; tiers seeded by 0096)

Per-tier price per SKU in `erp_wholesale_prices`; customer default tier via
`erp_wholesale_customer_tier`. "Project" is a tier **plus** an allowed per-line
override for negotiated deals.

| SKU | Retail | Semi-wholesale | Wholesale | Project (floor) |
|---|---|---|---|---|
| EL-2005 Solar Inverter 5kW | 18,900 | 18,200 | 17,500 | 16,800 (override per deal) |
| EL-2006 Water Pump 1HP | 4,300 | 4,100 | 3,900 | 3,750 |
| EL-2004 Distribution Board | 560 | 535 | 510 | 490 |
| EL-2002 Copper Cable (100m) | 1,050 | 1,010 | 975 | 940 |

**Resolution order (existing):** explicit line override → customer's assigned
tier price → product `sell_price`. Assign e.g. CUST-Project to the **project**
tier; contractors to **wholesale**; walk-ins to **retail**.

---

## 4. Warranty examples (`erp_warranties`; generated `end_date`)

Seeded on sale from the product's `warranty_months` (overridable per line); linked
to the **serial** when the product is serialized, else to (product + invoice).

| product | serial | start | period | end_date (auto) | status |
|---|---|---|---|---|---|
| Solar Inverter 5kW | SN-INV-0001 | 2026-06-01 | 36 mo | 2029-06-01 | active |
| Water Pump 1HP | SN-PMP-0007 | 2026-05-15 | 24 mo | 2028-05-15 | active |
| Smart Energy Meter | SN-MET-0042 | 2024-01-10 | 24 mo | 2026-01-10 | expired |

Warranty lookup at point of service/RMA confirms coverage; status is derived from
`end_date` (no scheduler).

---

## 5. Serial-number examples (`erp_product_serials`; lifecycle via the ledger)

Capture enforced **only** for `is_serialized` products. Status follows the
existing stock ledger.

| serial | product | status | warehouse | unit_cost | note |
|---|---|---|---|---|---|
| SN-INV-0001 | Solar Inverter 5kW | sold | WH-SHOWROOM | 14,500 | sold to project customer |
| SN-INV-0002 | Solar Inverter 5kW | in_stock | WH-MAIN | 14,500 | available |
| SN-PMP-0007 | Water Pump 1HP | rma | WH-SERVICE | 3,200 | under RMA (fault) |
| SN-MET-0042 | Smart Energy Meter | returned | WH-MAIN | 1,150 | customer return restocked |
| SN-STB-0015 | Voltage Stabilizer 10kVA | in_stock | WH-CAI | 2,800 | transferred from main |

Lifecycle: `purchase_in`→in_stock · `sale_out`→sold · `return_in`→returned ·
RMA→rma · serialized **transfer** relocates `warehouse_id` (extended
`erp_complete_transfer`, guarded by `is_serialized`).

---

## 6. RMA workflows (`erp_rma` + `erp_rma_set_status`; orchestrates returns)

Statuses: `requested → approved → received → repair | replace | refund → closed`
(or `rejected`). The RPC advances status **and** drives the linked serial; on
refund/replace it delegates to the existing sales-return RPC (no duplicate
accounting).

**Example A — Repair:** customer reports a faulty Water Pump (SN-PMP-0007, in
warranty). RMA `requested` → `approved` → `received` (serial → rma) → `repair` →
`closed`. No stock/accounting movement; serial returns to the customer.

**Example B — Replace:** Smart Energy Meter dead-on-arrival. RMA → `replace`:
serial → returned; a sales-return restocks the unit; a replacement serial is
issued/sold. Warranty re-linked to the new serial.

**Example C — Refund:** out-of-stock replacement. RMA → `refund`: delegates to
`erp_complete_sales_return` (restock `return_in` + contra-revenue + customer
balance); serial → returned; RMA `closed`.

Permission: `electrical.rma` (admin / manager / technician).

---

## 7. Supplier return workflows (`erp_purchase_returns` + `erp_complete_purchase_return`)

Mirror of sales returns for the supplier side (new in pack sub-slice A).

**Example — Defective batch to vendor:** 3 faulty Circuit Breakers (EL-2003)
received. Create `erp_purchase_returns` (supplier, branch, lines) → status draft →
`erp_complete_purchase_return`: emits **`return_out`** (stock leaves to supplier),
posts the **contra-purchase journal** (credit inventory 1300 / debit AP 2100), and
**reduces the supplier balance**. Permission: `purchasing.return` (admin/manager).

For serialized items returned to vendor, the serial → `scrapped`/`returned`.

---

## 8. Customer return workflows (existing `erp_sales_returns` + `erp_complete_sales_return`)

Standard sales return, reused by the pack and by RMA refund/replace.

**Example — Wrong item:** customer returns a Distribution Board (EL-2004). Create
`erp_sales_returns` (customer, invoice, lines) → `erp_complete_sales_return`:
restock `return_in` + contra-revenue journal + reduce customer balance. If the
returned item is serialized, the serial → `returned`. RMA-driven refunds/replaces
route through this same path (single source of truth for returns accounting).

---

## 9. User roles (seeded for the `electronics` business type)

| Role | Key | Core permissions (from baseline + pack) |
|---|---|---|
| Admin | `admin` | all |
| Manager | `manager` | all (incl. `wholesale.pricing`, `purchasing.return`, `electrical.rma`) |
| Cashier | `cashier` | sell, collect, customers, POS |
| Technician | `technician` | customers, sell, inventory view, stock request, **`electrical.rma`** (serials/warranty/RMA) |
| Warehouse Keeper | `warehouse_keeper` | inventory view/adjust/transfer/count, approve loading, purchasing |
| Accountant | `accountant` | accounting view/post, reports, suppliers, collect |
| Viewer | `viewer` | reports, accounting view, inventory view |

Seeded on company creation (`erp_seed_company_roles`); `wholesale.pricing` +
`purchasing.return` + `electrical.rma` backfilled to electronics admin/manager
(+ technician for RMA) by 0096/0097. Surfaced in the Suggested Roles step; fully
editable in Settings → Permissions.

---

## 10. Pilot success criteria

- **Tiered pricing accuracy:** Retail / Semi-wholesale / Wholesale / Project resolve
  correctly per customer; project line-overrides honored; no mispricing.
- **Serial traceability:** serialized sales capture serials; status correct across
  sale / transfer / return / RMA; van/branch stock reconciles.
- **Warranty:** warranties auto-created on sale; lookup confirms coverage; expiry
  derived correctly.
- **RMA:** repair / replace / refund flows complete; refund/replace post via the
  existing returns (no double accounting); serial status follows resolution.
- **Supplier returns:** defective-to-vendor posts `return_out` + contra-purchase
  journal + supplier-balance reduction.
- **Customer returns:** restock + contra-revenue + customer-balance reduction.
- **(Coexistence, optional):** items/stock/customers sync **in**; sales/invoices
  **out**; tiers/warranty/serials/RMA stay VANTORA-side, never overwritten.
- **Sign-off:** customer confirms goals met → conversion to paid annual + reference.

---

## 11. 30-day pilot plan

| Phase | Days | Activities |
|---|---|---|
| **Setup & seed** | 1–5 | Create electronics tenant; enable modules + pack; import products (set `is_serialized`/`warranty_months`); configure the four tiers + per-SKU tier prices; assign customer tiers; (coexistence) connect ERP sandbox + validate items/stock in, sales/invoices out. |
| **Train** | 6–10 | Role training: cashier (POS + tier pricing), technician (serials/warranty/RMA), warehouse (serialized transfers/receipts), accountant (returns posting + reports), manager (pricing + approvals + dashboards). |
| **Pilot run — week 1** | 11–17 | Real counter + wholesale + project sales with serial capture; warranty auto-creation; first RMA + supplier return; daily check-in. |
| **Pilot run — week 2** | 18–24 | Full tier matrix in use; exercise repair/replace/refund RMA, customer + supplier returns, serialized transfers; (coexistence) confirm sync cycles; mid-pilot review vs. §10. |
| **Measure & convert** | 25–30 | Measure against §10; capture results; coexistence sign-off; present conversion (annual + add-ons); agree case study. |

Weekly check-ins; named implementation contact + priority support channel.

---

## 12. Customer onboarding checklist

- [ ] Pilot scope + success criteria agreed and signed (this package).
- [ ] ERP confirmed (optional) and sandbox access arranged — or pilot runs standalone.
- [ ] Tenant created (business type `electronics`); plan = Professional+.
- [ ] Modules enabled: Sales, Inventory, Purchasing, Finance, POS, Analytics,
      Wholesale + Electrical capabilities (serials/warranty/RMA).
- [ ] Products imported with `is_serialized` + `warranty_months` set on high-value SKUs.
- [ ] Four tiers configured (Retail/Semi-wholesale/Wholesale/Project); per-SKU tier
      prices loaded; customer tiers assigned.
- [ ] Opening serialized stock loaded (serials, warehouse, unit_cost); branches +
      warehouses (showroom / main / service / regional) configured.
- [ ] Roles assigned (Suggested Roles step); user accounts per role; technician has
      `electrical.rma`.
- [ ] Warranty defaults verified (auto-create on sale); RMA + supplier-return +
      customer-return flows rehearsed once each.
- [ ] (Coexistence) adapter connection created, credentials in Vault, sync jobs for
      agreed entities/directions, two-way validated on sandbox; tiers/warranty/
      serials/RMA confirmed VANTORA-owned.
- [ ] Dashboards + reports reviewed with management.
- [ ] Training delivered per role; POS devices configured.
- [ ] Go-live date set; weekly check-in cadence + support channel established.
- [ ] Mid-pilot review (day ~18) and final review (day ~28) scheduled.

---

*Electrical Retail & Wholesale Pilot Package — baseline-only, exercising the
complete Electrical pack; no architecture or feature changes. Pair with
`COMMERCIAL-LAUNCH.md` §10 (pilot execution) and the Electrical demo environment.
The pack is production-live (0096/0097), so this pilot is ready to run.*
