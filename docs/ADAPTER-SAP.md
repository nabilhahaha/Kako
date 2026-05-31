# VANTORA — SAP Adapter Design Review (B3)

> Build-track slice **B3** — **design for approval, no implementation yet**.
> Builds on the framework (2C-1/2C-2), the **OData runtime pattern** proven in
> B2 (Dynamics BC), the **OAuth2 helper** (shared infra), and the **CSV/SFTP file
> path** (B1). Preserves two-way pull/push, module- & entity-level ownership,
> partial adoption, ERP coexistence, and all protected verticals.

SAP is the **highest-complexity** adapter — its variants differ sharply, and real
engagements frequently route through **customer middleware** (SAP Integration
Suite/CPI, PI/PO) and/or **files**. The design treats SAP as **one `sap_s4`
adapter with selectable transport** (OData vs file) rather than a single path.

---

## 1. Footprint
- **No migration.** Reuses `erp_integrations` + Vault secret + `erp_sync_jobs/_runs`.
- **New:** a `sap_s4` adapter descriptor + an OData runtime (likely a small
  **shared OData helper** extracted from the BC runtime — see §6) reusing
  `oauth2.ts`; the **file transport reuses B1's `csv_sftp`** runtime for ECC/
  on-prem feeds. Plus a dispatcher branch + entity-mapping presets + tests.

## 2. Per-variant design

### 2.1 SAP S/4HANA **Cloud** (public/private cloud)
- **Recommended method:** **OData** via SAP's standard APIs (API Business Hub) —
  `API_BUSINESS_PARTNER`, `API_PRODUCT_SRV`/material, `API_SALES_ORDER_SRV`,
  `API_BILLING_DOCUMENT_SRV`, stock APIs.
- **OData support:** strong (OData **v2** mostly, some v4); `$filter` on
  change/timestamp fields for delta; paging via `$top/$skip` or `$skiptoken`.
- **Auth:** OAuth2 (SAP BTP / communication arrangements) or Basic
  (communication user) — both via our **OAuth2 helper** / Basic header.
- **File/SFTP fallback:** rarely needed; available for bulk loads.
- **Middleware:** usually **none** required for standard OData (direct, or via BTP
  Destinations / API Management).
- **Complexity: Medium–High** (OData v2 idiosyncrasies, SAP field names, auth
  setup).
- **Ownership:** SAP = SoR for Finance/Inventory/Procurement; VANTORA = front
  office. Per-entity configurable.

### 2.2 SAP S/4HANA **On-Prem** (private)
- **Recommended method:** **OData via SAP Gateway** (activate the same OData
  services) **through the customer's connectivity layer** (SAP Cloud Connector /
  reverse proxy / VPN). Where direct OData isn't exposed, **file (SFTP)** or
  middleware.
- **OData support:** same services as Cloud once Gateway services are activated.
- **Auth:** Basic (technical user) / OAuth / principal propagation — per the
  customer's landscape.
- **File/SFTP fallback:** **common** — scheduled CSV/IDoc-XML drops over SFTP
  (reuses B1).
- **Middleware:** often **SAP Integration Suite / CPI** or **PI/PO** fronting the
  on-prem system; we connect to the **exposed OData endpoint or the SFTP drop**,
  **not** RFC/BAPI directly.
- **Complexity: High** (connectivity + customer landscape variance).
- **Ownership:** same SoR split; per-entity.

### 2.3 SAP **ECC** (legacy) — coexistence
- **Recommended method:** **File (SFTP) + middleware.** ECC lacks broad native
  OData; integrate via **IDoc** (DEBMAS=customer, MATMAS=material, ORDERS,
  INVOIC) or **BAPI/RFC**, **fronted by middleware** (CPI/PI-PO) that emits/【
  consumes **flat files (CSV/XML) over SFTP** — which VANTORA reads/writes with
  the **B1 csv_sftp** transport.
- **OData support:** none/limited (only via added Gateway add-on); not assumed.
- **File/SFTP fallback:** **this is the primary path** for ECC.
- **Middleware:** **required** (IDoc/BAPI ↔ file bridge). We never touch
  RFC/BAPI/SOAP-binary from our runtime.
- **Complexity: High** (IDoc shapes, middleware dependency).
- **Ownership:** ECC = SoR for Finance/Inventory; VANTORA = front office;
  per-entity via file feeds.

---

## 3. Variant comparison

| Variant | Primary method | OData | File/SFTP | Middleware | Complexity |
|---|---|---|---|---|---|
| **S/4HANA Cloud** | OData (standard APIs) | ✅ strong (v2±v4) | optional | usually none | Med–High |
| **S/4HANA On-Prem** | OData via Gateway (+ connectivity) | ✅ (activate services) | common | often (CPI/PI-PO/Cloud Connector) | High |
| **ECC (legacy)** | **File (SFTP) + middleware** (IDoc/BAPI) | ✗/limited | **primary** | **required** | High |

## 4. Entity mapping (presets)
| VANTORA | SAP object (OData / IDoc) | Direction (typical) |
|---|---|---|
| `customer` | Business Partner (customer role) / DEBMAS | in |
| `supplier` | Business Partner (vendor role) | in |
| `product` | Material / `API_PRODUCT_SRV` / MATMAS | in |
| inventory/stock | Material stock API | in |
| `order` | Sales Order (`API_SALES_ORDER_SRV`) / ORDERS | out |
| `invoice` | Billing Document / INVOIC | out |

Field-map presets ship with the adapter (SAP field names → VANTORA entity
fields), overridable per job; delta via SAP change/timestamp fields.

## 5. Preserved requirements
- **Two-way pull/push:** OData pull + push, and file in/out (B1) — both supported;
  `erp_sync_jobs.direction = in|out` per entity.
- **Module- & entity-level ownership:** per-entity sync jobs + `conflict_policy`.
- **Partial adoption:** entity/module-scoped — sync only the SAP objects the
  customer adopts.
- **ERP coexistence:** SAP owns Finance/Inventory/Procurement; VANTORA owns
  CRM/Sales/Field Ops/Trade Spend/Workflow/Analytics — configurable per entity.
- **Protected verticals untouched:** Clinic/Pharmacy/**Egyptian Drug List**/
  Distribution/Electrical features stay VANTORA-side and are never overwritten by
  SAP syncs.

## 6. Reuse vs new
- **Reuse:** dispatcher, `ingestRecord`, Vault, sync jobs/runs + delta cursor,
  audit, RLS, `oauth2.ts`, **B1 `csv_sftp`** for file feeds.
- **New:** `sap_s4` descriptor (transport: `odata` | `file`; auth: OAuth2 / Basic;
  base URL/service paths; or SFTP config) + an OData runtime. **Recommended
  refactor:** extract a small **shared OData helper** from `dynamics-bc-runtime`
  (GET `$filter`/paging, push) so BC + SAP share it — reduces duplication and
  speeds B4/B5. (Behavior-preserving; covered by existing BC tests + new SAP
  tests.)

## 7. Examples
- **FMCG Distribution:** SAP owns Materials, Stock, Finance, Procurement. VANTORA
  owns van sales/routes/journey, Trade Spend, credit-limit Workflow. Sync
  **in:** Business Partners (customers), Materials, stock levels. Sync **out:**
  sales orders + trade-spend settlements → SAP. Cloud → OData; ECC → file/IDoc.
- **Wholesale:** SAP owns items/price conditions/finance. VANTORA owns wholesale
  order capture + tiered pricing execution. **In:** customers, items, price
  lists; **out:** orders/invoices.
- **Electrical Retail & Wholesale:** SAP owns items/stock/finance. VANTORA owns
  **POS + multi-tier pricing (Retail/Half-Wholesale/Wholesale/Project) + warranty
  + serials** (Electrical pack). **In:** items, stock, customers; **out:** sales/
  invoices. Warranty/serial/tier data stays VANTORA-side — never overwritten by
  SAP.

## 8. Phasing (each a reviewable sub-slice, after design approval)
- **B3a — SAP S/4HANA Cloud (OData)** first: `sap_s4` adapter (odata transport) +
  shared OData helper + Business Partner/Material pull, order/invoice push.
- **B3b — On-Prem / ECC via file (SFTP) + middleware**: `sap_s4` file transport
  (reuses B1) + IDoc/CSV presets + connectivity/middleware playbook.

## 9. Verification (when built)
- Unit tests (mock fetch / mock SFTP): OData URL/`$filter`/paging, auth, pull-map,
  push, throttling; file IDoc/CSV parse/serialize. `tsc`/build/vitest.
- **No DB migration.** Live SAP validation requires a **customer/sandbox SAP
  system + (often) middleware** — mock-tested until a pilot provides one (same
  posture as B2).

## 10. Decisions to confirm (before building B3)
1. **First variant:** **S/4HANA Cloud (OData)** first (B3a), on-prem/ECC file
   (B3b) next? *(Recommended.)*
2. **First entity set:** Business Partner→`customer`/`supplier` + Material→
   `product` (in), then `order`/`invoice` (out)? *(Recommended — mirrors B2.)*
3. **Shared OData helper:** extract from the BC runtime now (BC + SAP reuse) —
   shipped as a small behavior-preserving refactor inside B3a? *(Recommended.)*
4. **Auth for first cut:** support **OAuth2 (BTP) + Basic (communication user)**?
   *(Recommended — covers most Cloud setups.)*
5. **Live validation:** confirm a SAP sandbox/customer system (+ middleware where
   needed) will come via a pilot; until then unit/mock tests only.

*(B3 design — paused for your review. On approval I'll build **B3a** first,
verify, and bring back the package before any merge/runtime change.)*
