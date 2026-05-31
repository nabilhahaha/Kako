# VANTORA — SAP On-Prem / ECC Adapter Design Review (B3b)

> Build-track slice **B3b** — **design for approval, no implementation yet.**
> Extends the existing `sap_s4` adapter (B3a: S/4HANA Cloud, OData ✅ built) with
> a **file (SFTP) transport** for **S/4HANA On-Prem** and **SAP ECC**, reusing the
> **B1 `csv_sftp` runtime**. Preserves two-way pull/push, module- & entity-level
> ownership, partial adoption, ERP coexistence, and **all protected verticals**
> (Clinic / Pharmacy / Egyptian Drug List / Distribution / Electrical Retail &
> Wholesale) — never overwritten by SAP syncs.
>
> Grounded in `ADAPTER-SAP.md` (B3 review) §2.2 / §2.3 / §6 / §8. **No migration.**

---

## 1. Why B3b is a *transport*, not a new adapter
B3a already ships the `sap_s4` descriptor + OData runtime (OAuth2/Basic on the
shared `odata.ts`). On-prem and ECC engagements rarely expose direct OData — they
route through **customer middleware** (SAP Integration Suite/CPI, PI/PO) and/or
**flat-file drops over SFTP** (IDoc/CSV/XML extracts). So B3b keeps **one
connectable "SAP" system** and adds a **`transport` selector** (`odata | file`)
to the same `sap_s4` adapter, with the file path delegating to the proven B1
`csv_sftp` runtime. This avoids a second SAP adapter in the registry and bundles
the SAP-specific knowledge (field presets, file conventions) in one place.

> We connect **only** to the **exposed OData endpoint** or the **SFTP file drop** —
> **never** to RFC/BAPI/SOAP-binary directly. IDoc/BAPI↔file bridging is the
> customer middleware's job (this is the standard, supportable coexistence shape).

## 2. Footprint (additive, reuse-first)
- **No migration.** Reuses `erp_integrations` (+ Vault secret), `erp_sync_jobs` /
  `erp_sync_runs`, the dispatcher, `ingestRecord`, RLS, audit, and the **B1
  `csv_sftp` runtime** (`pullCsvSftp` / `pushCsvSftp`) verbatim.
- **New (code-only):**
  1. `sap_s4` descriptor gains a **`transport` select** (`odata` default | `file`).
     When `file`, the config surfaces the SFTP fields (host/port/username/
     `remote_path` patterns/format) and the secret = password **or** private key.
  2. A small **`sap-presets.ts`** — named SAP **field-map presets** (IDoc/CSV
     column → VANTORA entity field) per entity, overridable per job.
  3. **Dispatcher branch:** for `sap_s4` with `transport === 'file'`, route to
     `pullCsvSftp` / `pushCsvSftp` (with the resolved SAP preset field-map)
     instead of the OData runtime. OData path (B3a) is unchanged.
  4. Unit tests (mock SFTP client + preset mapping). `tsc`/build/vitest.

## 3. Per-variant transport
| Variant | Primary B3b transport | Notes |
|---|---|---|
| **S/4HANA On-Prem** | OData via Gateway (B3a runtime) **through customer connectivity** (Cloud Connector / reverse proxy / VPN); **file (SFTP)** where OData isn't exposed | Same OData services as Cloud once Gateway services are activated; B3b adds the file fallback + connectivity playbook. |
| **SAP ECC (legacy)** | **File (SFTP) + middleware** | ECC lacks broad native OData. Middleware (CPI/PI-PO) emits/consumes **flat files** from IDocs (DEBMAS / MATMAS / ORDERS / INVOIC) / BAPI; VANTORA reads/writes those files via `csv_sftp`. |

## 4. File shapes (first cut vs. follow-up)
- **First cut:** **CSV** and **JSON** flat extracts produced/consumed by the
  customer middleware (the most common, lowest-friction shape — middleware
  flattens IDoc segments to columns). Reuses `import-parse` / `export-serialize`
  exactly as B1 does. **File feeds are full-snapshot** (no modified-since cursor →
  `mode = full`), matching the existing csv_sftp posture.
- **Follow-up (documented extension):** native **IDoc-XML** segment parsing
  (control + data segments) for sites that drop raw IDoc-XML rather than
  middleware-flattened CSV. Tracked, not built in B3b first cut.

## 5. Entity mapping presets (SAP → VANTORA)
| VANTORA entity | SAP object (IDoc / OData) | Typical direction |
|---|---|---|
| `customer` | Business Partner (customer) / **DEBMAS** | in |
| `supplier` | Business Partner (vendor) / **CREMAS** | in |
| `product` | Material / `API_PRODUCT_SRV` / **MATMAS** | in |
| inventory/stock | Material stock extract | in |
| `order` | Sales Order (`API_SALES_ORDER_SRV`) / **ORDERS** | out |
| `invoice` | Billing Document / **INVOIC** | out |

Presets ship as named maps (e.g. `sap_debmas_customer`), selectable per sync job
and fully overridable. Delta for file feeds = full snapshot; OData delta (B3a)
uses SAP change/timestamp `$filter`.

## 6. Connectivity / middleware playbook (docs deliverable)
- **On-Prem OData:** via **SAP Cloud Connector** / reverse proxy / VPN to the
  Gateway OData service; auth Basic (technical user) / OAuth / principal prop.
- **ECC / file:** middleware (**CPI** or **PI/PO**) bridges IDoc/BAPI ↔ **CSV/XML
  over SFTP**; agree per-entity **remote_path** conventions (e.g.
  `/out/customers_YYYYMMDD.csv` inbound to VANTORA, `/in/orders_*.csv` outbound),
  encoding (UTF-8), and delimiter. VANTORA only needs the SFTP drop + schema.
- **Coexistence:** SAP = SoR for Finance / Inventory / Procurement; VANTORA = CRM
  / Sales / Field Ops / Trade Spend / Workflow / Analytics — **per-entity**
  `direction` + `conflict_policy`.

## 7. Preserved requirements
- **Two-way:** file in (pull) + file out (push) via csv_sftp; `direction` per job.
- **Module/entity ownership & partial adoption:** per-entity sync jobs — sync only
  the SAP objects the customer adopts.
- **Protected verticals untouched:** Clinic / Pharmacy / **Egyptian Drug List** /
  Distribution / Electrical features stay VANTORA-side; SAP syncs never write them
  (only the mapped entities above are exchanged; conflict policy guards the rest).
- **Capability-seed slice (CRM/Workflow/Analytics/Integrations nav gating)**
  remains a separate tracked follow-up — unaffected by B3b.

## 8. Examples
- **FMCG Distribution (ECC):** middleware drops **DEBMAS** (customers), **MATMAS**
  (materials), stock CSVs to SFTP → VANTORA pulls. VANTORA pushes sales orders +
  trade-spend settlements as **ORDERS** CSVs → middleware posts to ECC. Van sales/
  routes/journey + credit Workflow stay VANTORA-side.
- **Wholesale (On-Prem):** OData via Gateway where exposed; else SFTP item/price
  extracts in, order/invoice files out. Tiered pricing executes in VANTORA.
- **Electrical Retail & Wholesale (On-Prem/ECC):** items/stock/customers in
  (file/OData); sales/invoices out. **Multi-tier pricing / warranty / serials**
  stay VANTORA-side — never overwritten by SAP.

## 9. Verification (when built)
- **Unit (mock SFTP + preset mapping):** file pull → preset field-map → ingest
  shape; file push → preset map → CSV/JSON serialize; transport-selector
  validation (file requires host/username/remote_path; odata path unchanged).
- Existing B3a OData tests stay green (no behavior change to the OData path).
- `tsc` / `next build` / `vitest`. **No DB migration → no prod-apply gate.**
- **Live SAP+middleware validation deferred** to a pilot providing a sandbox
  (same mock-tested posture as B2/B3a).

## 10. Decisions to confirm (before building B3b)
1. **Model:** add a **`transport` selector to `sap_s4`** (`odata | file`, one
   adapter) — *Recommended* — vs. reusing the standalone `csv_sftp` adapter with
   SAP presets (no descriptor change)?
2. **First file shapes:** **CSV + JSON** middleware-flattened extracts first;
   **IDoc-XML** parsing as a tracked follow-up? *(Recommended.)*
3. **First entity set:** DEBMAS→`customer`, CREMAS→`supplier`, MATMAS→`product`
   (in); ORDERS / INVOIC (out)? *(Recommended — mirrors B3a/B2.)*
4. **Delta posture:** file feeds = **full snapshot** (`mode = full`, no cursor),
   OData delta unchanged? *(Recommended — matches B1 csv_sftp.)*
5. **Boundary:** connect **only** to exposed OData / SFTP drop — **never**
   RFC/BAPI directly (middleware owns IDoc/BAPI↔file)? *(Reconfirm.)*
6. **Live validation:** defer to a pilot SAP+middleware system; unit/mock until
   then? *(Recommended.)*

*(B3b design — paused for your review. On approval I'll build it → test → open a
draft PR → bring back the review package; no production apply without approval.)*
