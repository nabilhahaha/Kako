# VANTORA — Odoo Adapter (B5)

> **Status: ✅ built (code-only; no migration).** Decisions 1–5 confirmed
> (dedicated `odoo` JSON-RPC adapter; API key v14+ primary + user/pass fallback;
> res.partner→customer/supplier, product.template→product in, sale.order/
> account.move out, stock.quant a follow-up; `write_date > cursor` /
> max(write_date) / limit-offset paging; live validation deferred). Shipped: the
> `odoo` descriptor, `odoo-runtime.ts` (authenticate → search_read pull / create
> push), `odoo-presets.ts`, registry + dispatcher wiring, and unit tests. Live
> Odoo validation pending a pilot instance (mock-tested until then).
>
> Adds a thin **`odoo`** connector over **JSON-RPC** (plain HTTP/JSON — fits our
> Node dispatcher directly; no OAuth dance, no request signing). Builds on the
> 2C-1/2C-2 framework and the injectable-`fetch` runtime pattern proven in
> `generic_rest` / Dynamics BC / SAP. Preserves two-way pull/push, module- &
> entity-level ownership, partial adoption, ERP coexistence, and **all protected
> verticals** (Clinic / Pharmacy / Egyptian Drug List / Distribution / Electrical
> Retail & Wholesale) — never overwritten by Odoo syncs.
>
> Reference: `INTEGRATION-ADAPTERS.md` §3.4. **No migration.**

---

## 1. Why a dedicated (thin) `odoo` adapter
Odoo's external API is **JSON-RPC** (`POST /jsonrpc`), not plain REST resource
URLs — the request is an envelope (`service`/`method`/`args`) and reads use the
`search_read` model method with a **domain** filter. `generic_rest` can't express
that envelope cleanly, so B5 adds a **small `odoo` runtime** that builds the
JSON-RPC body and maps Odoo models/fields ↔ VANTORA entities. It is the
**lowest-friction real-vendor adapter** (no signing, no token dance) — mostly
model/field mapping.

## 2. Footprint (additive, reuse-first)
- **No migration.** Reuses `erp_integrations` (+ Vault secret), `erp_sync_jobs` /
  `erp_sync_runs`, the dispatcher, `ingestRecord`, RLS, audit, and the runtime
  conventions (injectable `fetch`, `mapRecord`, max-`write_date` cursor).
- **New (code-only):**
  1. `odoo` adapter **descriptor** (`kind: 'rest'`): `base_url`, `database`,
     `username` (login); secret = **API key** (v14+) or password.
  2. **`odoo-runtime.ts`** — JSON-RPC pull (`search_read` with domain + fields +
     limit/offset paging, `write_date > cursor` delta) and push (`create`/
     `write` via `execute_kw`); injectable `fetch`, unit-testable.
  3. **Model/field presets** (`odoo-presets.ts`) — Odoo model+fields ↔ VANTORA
     entity, overridable per job.
  4. Dispatcher branch for `odoo` + registry entry + unit tests.

## 3. Auth & call shape (first cut)
- **Auth:** **API key (v14+)** primary, **username/password** fallback. Flow:
  `common.authenticate(db, login, key)` → **uid**, then
  `object.execute_kw(db, uid, key, model, method, args, kwargs)`. The key/password
  is the single **Vault** secret; `db`/`login`/`base_url` are non-secret config.
- **Pull (in):** `execute_kw(db, uid, key, model, 'search_read', [domain], {fields, limit, offset, order:'write_date asc'})`; delta domain `[['write_date','>',cursor]]`; cursor = max `write_date`.
- **Push (out):** `execute_kw(… 'create', [vals])` (or `'write'` when an Odoo id is known); per-record, count sent/failed (mirrors `pushGenericRest`).
- **Variants:** Odoo **Online (SaaS) / Odoo.sh / on-prem**, v16/17/18 — the same
  JSON-RPC API; on-prem differs only by URL/connectivity.

## 4. Entity mapping presets (Odoo model ↔ VANTORA)
| VANTORA entity | Odoo model | Direction | Notes |
|---|---|---|---|
| `customer` | `res.partner` (`customer_rank > 0`) | in | domain filters customers |
| `supplier` | `res.partner` (`supplier_rank > 0`) | in | same model, vendor domain |
| `product` | `product.template` / `product.product` | in | |
| inventory/stock | `stock.quant` | in | optional follow-up |
| `order` | `sale.order` | out | |
| `invoice` | `account.move` (type `out_invoice`) | out | |

Inbound presets map Odoo fields → VANTORA (`id`→`external_id`, `name`→`name`,
`phone`/`email`/`city`, `default_code`→`code`, `barcode`, `uom_id`→`unit`);
outbound presets map VANTORA → Odoo vals. Job `field_map` overrides.

## 5. Preserved requirements
- **Two-way:** JSON-RPC pull (`search_read`) + push (`create`/`write`);
  `direction` per job.
- **Module/entity ownership & partial adoption:** per-entity sync jobs +
  `conflict_policy` — sync only the Odoo models the customer adopts.
- **ERP coexistence:** Odoo often the SMB SoR (Finance/Inventory/Procurement);
  VANTORA owns CRM/Sales/Field Ops/Trade Spend/Workflow/Analytics — per entity.
- **Protected verticals untouched:** Clinic / Pharmacy / **Egyptian Drug List** /
  Distribution / Electrical features stay VANTORA-side; only the mapped entities
  are exchanged; conflict policy guards the rest.
- **Capability-seed slice** (CRM/Workflow/Analytics/Integrations nav gating)
  remains a separate tracked follow-up — unaffected.

## 6. Examples
- **FMCG Distribution:** Odoo owns products, stock, finance. VANTORA pulls
  `res.partner` (customers), `product.template`, `stock.quant`; pushes
  `sale.order` (van sales) + settlements. Routes/journey/trade spend stay VANTORA.
- **Electrical Retail & Wholesale:** Odoo owns items/stock/finance; VANTORA owns
  POS + **multi-tier pricing / warranty / serials** (Electrical pack). In:
  products, stock, partners; out: sales/invoices. Tier/warranty/serial stay
  VANTORA-side — never overwritten.

## 7. Verification (when built)
- **Unit (injected fetch):** JSON-RPC envelope shape; `authenticate`→uid; delta
  domain build (`write_date >`); paging (limit/offset); pull field-map → ingest
  shape; push `create` vals; auth/error handling.
- `tsc` / `next build` / `vitest`. **No DB migration → no prod-apply gate.**
- **Live Odoo validation deferred** to a pilot instance (mock-tested until then —
  same posture as B2/B3a/B3b).

## 8. Decisions to confirm (before building B5)
1. **Adapter:** new thin **`odoo`** (JSON-RPC) adapter — *Recommended* — vs.
   stretching `generic_rest`?
2. **Auth:** **API key (v14+)** primary + username/password fallback? *(Rec.)*
3. **First entities:** `res.partner`→`customer`/`supplier`, `product.template`→
   `product` (in); `sale.order`/`account.move` (out)? `stock.quant` a follow-up?
   *(Rec — mirrors B2/B3.)*
4. **Delta:** `write_date > cursor`, cursor = max `write_date`, paging via
   limit/offset? *(Rec.)*
5. **Live validation:** defer to a pilot Odoo instance; unit/mock until then?
   *(Rec.)*

*(B5 design — paused for your review. On approval I'll build it → test → open a
draft PR → bring back the review package; no production apply without approval.
Then B4 — Oracle NetSuite.)*
