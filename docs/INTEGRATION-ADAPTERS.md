# VANTORA — External ERP Adapter Roadmap & Architecture Review

> Phase 2C-3+ planning. Builds on the **proven Connector Framework (2C-1)** +
> **Sync Engine (2C-2)**. Every adapter is a registered descriptor + a runtime
> transport on that framework — **no new screens, no per-vendor forks**.
> Governed by the modularity & coexistence principle (`PRODUCT_PRINCIPLES.md`).

Status: **architecture review for approval** — no implementation yet.

---

## 1. What an adapter must provide (recap of the framework contract)

An adapter plugs into the existing framework by supplying:
- a **registry descriptor** (`src/lib/erp/connectors/`): `key`, `kind`
  (`rest|odata|file`), config fields, the single Vault **secret** field,
  `validateConfig` — already the shape used by `generic_rest` / `csv_sftp`;
- a **runtime** (`connectors/runtime/<vendor>.ts`): `pull(entity, since, cursor)`
  + `push(entity, records)` + field mapping, invoked by the **Node dispatcher**
  (`/api/internal/sync-tick`), reusing `ingestRecord` inbound and the entity
  reader outbound;
- **per-entity sync jobs** (`erp_sync_jobs`) decide *which* entities sync, the
  direction, mode (full/delta), cursor, and **conflict policy**.

Everything else — scheduling (Vercel Cron), Vault secrets, RLS, audit, run
logging, reconciliation, backoff — is inherited. So a vendor adapter is mostly
**protocol + auth + entity/field mapping**, not new infrastructure.

---

## 2. Coexistence model (applies to every adapter)

Per the standing principle, the role is chosen **per module/entity**, never
globally:
- **VANTORA = system of record** for a module → it owns the data; the ERP reads
  it (outbound push / the inbound API).
- **External ERP = system of record** for a module → only those entities sync
  **in**; VANTORA owns the rest.

A typical split (configurable, not fixed):

| Module | Common source of record | Direction into VANTORA |
|---|---|---|
| Finance / GL | External ERP | (none — ERP owns) or read-only mirror |
| Inventory & Warehousing | External ERP (often) | **in** (stock levels, items) |
| Procurement | External ERP | **in** / **both** |
| Sales (orders/invoices) | Either | **out** (VANTORA-created orders → ERP) |
| CRM | **VANTORA** (typical) | — (VANTORA owns) |
| Field Operations | **VANTORA** | — |
| Trade Spend | **VANTORA** | **out** (settlements → ERP finance) |
| Approvals & Workflow | **VANTORA** | — |
| Analytics & Reporting | **VANTORA** (reads all) | — |
| Billing | **VANTORA** (SaaS billing) | — |

Master data (customers/suppliers/products) is the most common **inbound** sync;
transactions VANTORA originates (orders, trade-spend settlements) are the most
common **outbound** sync.

---

## 3. Per-vendor analysis

### 3.1 SAP
- **Variants:** S/4HANA (Cloud / on-prem), ECC (legacy), Business One (SMB),
  Business ByDesign.
- **Protocols:** **OData v2/v4** (S/4HANA APIs via SAP API Hub / BTP API
  Management); legacy ECC commonly via **IDoc / BAPI / SOAP** fronted by
  middleware (PI/PO, Integration Suite/CPI) or **file (SFTP) IDoc drops**.
- **Auth:** OAuth2 (BTP), Basic, or SAP API-Management API keys; on-prem needs a
  gateway/middleware (we do **not** connect to RFC/BAPI directly).
- **Entities / use cases:** Business Partner (customer/supplier), Material
  (product), Sales Order, Billing Document (invoice), Stock/Inventory, Financial
  postings.
- **Complexity: HIGH** — variant fragmentation, OData idiosyncrasies, on-prem
  connectivity, IDoc shapes. Real engagements often need middleware.
- **SoR scenarios:** SAP almost always SoR for Finance/Inventory/Procurement;
  VANTORA = front office (Field Sales, CRM, Trade Spend, promotions).
- **Coexistence:** master data **in** (partners, materials, stock); VANTORA sales
  orders + trade-spend settlements **out** to SAP. Highest enterprise value,
  highest effort.

### 3.2 Oracle
- **Variants:** **NetSuite** (mid-market, very common), Oracle **Fusion Cloud
  ERP** (enterprise), E-Business Suite (legacy), JD Edwards.
- **Protocols:** NetSuite **SuiteTalk REST** + RESTlets + SOAP; Fusion **REST**
  (+ limited OData, BI Publisher).
- **Auth:** NetSuite **Token-Based Auth (OAuth 1.0a HMAC)** or OAuth2; Fusion
  OAuth2 / Basic. (TBA request signing is the main friction.)
- **Entities / use cases:** Customer, Item, Sales Order, Invoice, Inventory, GL.
- **Complexity: MEDIUM–HIGH** — NetSuite REST is pragmatic but TBA signing adds
  work; Fusion is heavier.
- **SoR scenarios:** NetSuite often the full ERP SoR for SMB/mid; VANTORA adds
  field execution + trade spend + CRM.
- **Coexistence:** customers/items **in**; orders/invoices **out**.

### 3.3 Microsoft Dynamics
- **Variants:** **Business Central** (BC, SMB/mid — friendliest), Dynamics 365
  **Finance & Operations** (F&O, enterprise), Dynamics 365 **Sales/CRM**
  (Dataverse).
- **Protocols:** **OData v4** (BC API `/v2.0`, Dataverse Web API) + REST.
- **Auth:** **Azure AD (Entra) OAuth2 client-credentials** — standard, well
  documented.
- **Entities / use cases:** Customer, Item, Sales Order, Sales Invoice,
  Inventory; Dataverse accounts/contacts for CRM.
- **Complexity: MEDIUM** — clean OData v4 (`$filter modifiedon gt …` for delta),
  standard OAuth2. BC is the cleanest enterprise-grade target.
- **SoR scenarios:** BC/F&O = Finance/Inventory SoR; Dataverse CRM either side.
- **Coexistence:** OData selective sync; OAuth2 token step + delta via
  `$filter`.

### 3.4 Odoo
- **Variants:** Odoo Online (SaaS), Odoo.sh, on-prem; v16/17/18. Huge SMB/mid
  footprint incl. **MENA**.
- **Protocols:** **JSON-RPC** (HTTP/JSON — fits our Node dispatcher directly) and
  XML-RPC. External API via these (`/jsonrpc`, `call` → model method like
  `search_read`).
- **Auth:** **API key** (v14+) or username/password; **database name** required
  in the call. No request signing.
- **Entities / use cases:** `res.partner` (customer/supplier), `product.product`
  / `product.template`, `sale.order`, `account.move` (invoice), `stock.quant`
  (inventory).
- **Complexity: MEDIUM (lowest real-vendor friction)** — JSON-RPC is plain
  HTTP/JSON (no signing, no OAuth dance); main work is model/field mapping
  (`res.partner` → `customer`) and the JSON-RPC envelope. A dedicated `odoo`
  adapter (not `generic_rest`) but thin.
- **SoR scenarios:** Odoo often the full SMB ERP SoR; VANTORA adds field
  sales/trade spend/CRM execution.
- **Coexistence:** JSON-RPC selective sync; delta via `write_date > cursor`.

---

## 4. Comparison matrix

| Vendor | Primary protocol | Auth | Delta mechanism | Complexity | Reuses generic_rest? |
|---|---|---|---|---|---|
| **Odoo** | JSON-RPC (HTTP/JSON) | API key + db | `write_date >` | **Medium (lowest)** | New thin `odoo` adapter |
| **Dynamics BC** | OData v4 | Azure AD OAuth2 (client-cred) | `$filter modifiedon gt` | **Medium** | Mostly (OData = REST + token step) |
| **Oracle NetSuite** | SuiteTalk REST | TBA (OAuth1-HMAC) / OAuth2 | `lastModified` | **Medium–High** | Partly (signing layer) |
| **SAP S/4HANA** | OData v2/v4 (+IDoc/file) | OAuth2 / API key / middleware | OData delta tokens | **High** | Partly (OData) + file sub-slice |

Effort is expressed in **reviewable sub-slices**, each design→build→verify→PR
(the cadence used for 2A–2C): Odoo ≈ 1 slice; Dynamics BC ≈ 1–2 (OAuth2 token
mgmt + OData); NetSuite ≈ 2 (TBA signing); SAP ≈ 2–3 (variants + likely a
file/IDoc sub-slice, depends on the customer's landscape).

---

## 5. Adapter priority — DECIDED

**Approved order (demand- and value-driven, overrides the technical-simplicity
default):**

1. **Dynamics 365 Business Central** (OData v4)
2. **SAP S/4HANA** (OData v2/v4; on-prem/ECC via file/middleware)
3. **Oracle NetSuite** (SuiteTalk REST + TBA)
4. **Odoo** (JSON-RPC)

**Override rule (standing):** if a real pilot customer requires a specific ERP,
that customer requirement **overrides** this default order.

> Note: this prioritises commercial value over implementation simplicity. The
> technical-simplicity ranking (Odoo first) is retained below only as rationale;
> the **decided build order is the list above**, with **Dynamics 365 Business
> Central first**.

### (Original technical-simplicity rationale, for reference)
The lowest-friction-first view was Odoo → Dynamics BC → NetSuite → SAP:
- **Lowest protocol friction on the proven REST dispatcher** — JSON-RPC is plain
  HTTP/JSON with simple API-key auth (no OAuth dance, no HMAC signing), so it
  validates the *vendor adapter pattern* (model/field mapping, delta, conflict
  policy) with the least new infrastructure.
- **Strong real demand** in SMB/mid-market, including GCC/Arab markets, so it's
  commercially useful, not just a tech demo.
- **De-risks the heavier adapters:** proving Odoo end-to-end hardens the runtime
  contract before tackling OAuth2 (Dynamics), TBA signing (NetSuite), and SAP's
  variant/middleware complexity.

**Override rule:** if a concrete customer is on a specific ERP (e.g. a signed
deal running SAP), **demand wins** — we build that adapter first. This roadmap is
the default ordering absent a specific demand signal.

Strong enterprise alternative if you prefer an OAuth2/OData proof first:
**Dynamics 365 Business Central** (cleanest enterprise-grade OData v4 + standard
Azure AD OAuth2).

---

## 6. Phased delivery roadmap — DECIDED ORDER (each a reviewable sub-slice)

- **2C-3 — CSV/SFTP transport** — ✅ **built (B1)**: `ssh2-sftp-client` (server-
  external) + file **pull/push** on the `csv_sftp` adapter, wired into the sync
  dispatcher; CSV + JSON; unit-tested. Pending production apply note: none (no
  migration; needs `SUPABASE_SERVICE_ROLE_KEY` + `CRON_SECRET` at runtime).
- **2C-4 — Dynamics 365 Business Central (OData v4)** — ✅ **built (B2)**: reusable
  OAuth2 client-credentials helper + OData v4 pull/push (delta via
  `lastModifiedDateTime`), `dynamics_bc` descriptor + runtime + dispatcher
  wiring + presets + unit tests. SaaS only; live validation pending a pilot
  sandbox.
- **2C-5 — SAP S/4HANA** — OData v2/v4; on-prem/ECC handled via the file (SFTP)
  path + middleware, scoped to the customer's landscape.
- **2C-6 — Oracle NetSuite** — adds the **TBA (OAuth1-HMAC) signing** layer.
- **2C-7 — Odoo** — `odoo` descriptor + JSON-RPC runtime.

(Order overridden by a real pilot customer's ERP if one is in play.) Each
delivers: descriptor + runtime + per-entity mapping presets + docs + tests +
rolled-back live verification, held for approval before production apply.

---

## 7. Cross-cutting (shared by all adapters — already built or small additions)

- **Auth/secrets:** each connection's credential in **Supabase Vault** (2C-1);
  OAuth2/TBA add a small token/signing helper in the runtime, never new secret
  storage. OAuth2 refresh tokens also live in Vault.
- **Delta/watermark:** per-entity `cursor` (2C-2) maps to each vendor's
  modified-since field (`write_date`, `modifiedon`, `lastModified`, OData delta
  token).
- **Reconciliation & conflict:** per-job `conflict_policy`
  (`source_wins`/`vantora_wins`/`manual_review`) already drives ingest behavior;
  `manual_review` → review queue (full UI is a later refinement).
- **Errors/retry/rate limits:** run status + backoff + circuit-breaker pattern
  from 2B/2C-2; per-vendor rate-limit headers respected in the runtime.
- **Field mapping:** reuses the mapping-template concept; per-vendor **default
  field-map presets** ship with each adapter (e.g. `res.partner.name → name`).
- **Modularity:** Integrations is itself a module/entitlement; enabling an
  adapter never couples modules — selective per-entity sync keeps coexistence
  clean.

---

## 8. Decisions — RESOLVED

1. **Build order:** CSV/SFTP (2C-3) **first**, then vendor adapters in the order
   **Dynamics 365 BC → SAP S/4HANA → Oracle NetSuite → Odoo** — a real pilot
   customer's ERP overrides.
2. **Prioritisation basis:** commercial value / customer demand (not only
   implementation simplicity).
3. **Coexistence (standing):** ERP may own **Finance / Inventory / Procurement**;
   VANTORA may own **CRM / Sales / Field Operations / Trade Spend / Approvals /
   Analytics / Workflow** — ownership remains **configurable per module and per
   entity** (per sync job).
4. **Transport boundary:** OData/REST + file (SFTP) only; **no direct
   RFC/BAPI/SOAP-binary** from our runtime (middleware/file instead).

*(Item #1 of 5 — approved. Next: #2 Full platform documentation plan.)*
