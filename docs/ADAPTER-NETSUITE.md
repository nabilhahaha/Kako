# VANTORA — Oracle NetSuite Adapter (B4)

> **Status: ✅ built (code-only; no migration).** Decisions 1–7 confirmed
> (dedicated `netsuite` adapter; TBA OAuth 1.0a HMAC-SHA256; record API first,
> SuiteQL a follow-up; customer / vendor→supplier / inventoryItem→product in,
> salesOrder / invoice out, stock balances a follow-up; `lastModifiedDate` +
> limit/offset; single packed Vault secret; live validation deferred). Shipped:
> shared `oauth1.ts` TBA signer (Node crypto, no dep; verified against a known
> HMAC-SHA256 vector), `netsuite` descriptor, `netsuite-runtime.ts` (record-API
> pull/push), `netsuite-presets.ts`, registry + dispatcher wiring, unit tests.
> Live NetSuite validation pending a pilot account (mock-tested until then).
>
> Adds a **`netsuite`** connector over **SuiteTalk REST** with **Token-Based Auth
> (OAuth 1.0a, HMAC-SHA256 request signing)**. Builds on the 2C-1/2C-2 framework
> and the injectable-`fetch` runtime pattern (generic_rest / Dynamics BC / SAP /
> Odoo). Preserves two-way pull/push, module- & entity-level ownership, partial
> adoption, ERP coexistence, and **all protected verticals** (Clinic / Pharmacy /
> Egyptian Drug List / Distribution / Electrical Retail & Wholesale) — never
> overwritten by NetSuite syncs.
>
> Reference: `INTEGRATION-ADAPTERS.md` §3.2. **No migration.**

---

## 1. The one new thing: TBA request signing
NetSuite SuiteTalk REST is plain REST/JSON (like our other adapters) — the only
real friction is **Token-Based Auth**: every request carries an
`Authorization: OAuth …` header whose **HMAC-SHA256 signature** is computed over
the request (method + URL + sorted OAuth params) using
`consumer_secret&token_secret` as the key. This is the **highest-friction auth**
of the four vendors but is deterministic and unit-testable.

- **New shared infra:** a small **`oauth1.ts`** helper (HMAC-SHA256 signature +
  `Authorization` header builder) alongside the existing `oauth2.ts`. Uses Node's
  built-in `crypto` (no new dependency). Pure + unit-testable with fixed nonce/
  timestamp injection (so the signature is reproducible in tests).
- **Realm** = the NetSuite **account ID**; base URL is account-specific:
  `https://<accountId>.suitetalk.api.netsuite.com/services/rest`.

## 2. Footprint (additive, reuse-first)
- **No migration.** Reuses `erp_integrations` (+ Vault), `erp_sync_jobs`/`_runs`,
  the dispatcher, `ingestRecord`, RLS, audit, `mapRecord`, and the max-watermark
  cursor convention.
- **New (code-only):**
  1. **`oauth1.ts`** — TBA (OAuth 1.0a HMAC-SHA256) signer + header builder.
  2. `netsuite` **descriptor**: `account_id`, `consumer_key`, `token_id`
     (non-secret config); the single **Vault secret** packs `consumer_secret` +
     `token_secret` (the two signing secrets — see §5).
  3. **`netsuite-runtime.ts`** — REST pull (record API list + delta) and push
     (record create), signing each request via `oauth1.ts`; injectable fetch.
  4. **`netsuite-presets.ts`** — record-type + field maps per entity.
  5. Dispatcher branch + registry entry + unit tests.

## 3. Read/write model (first cut)
- **Pull (in):** SuiteTalk REST **record API** list, e.g.
  `GET /record/v1/customer?q=lastModifiedDate AFTER "<cursor>"` (record query),
  paged via `limit`/`offset`; map fields → VANTORA. (SuiteQL via
  `POST /query/v1/suiteql` is a documented alternative for richer filters — kept
  as a follow-up; first cut uses the record API for symmetry with the others.)
- **Push (out):** `POST /record/v1/{type}` with the mapped JSON body; per-record
  sent/failed counting (mirrors the other runtimes).
- **Delta:** `lastModifiedDate` watermark; cursor = max `lastModifiedDate`.
- **Paging:** `limit` + `offset` (NetSuite REST default page size).

## 4. Entity mapping presets (VANTORA ↔ NetSuite record type)
| VANTORA entity | NetSuite record type | Direction |
|---|---|---|
| `customer` | `customer` | in |
| `supplier` | `vendor` | in |
| `product` | `inventoryItem` (+ non-inventory variants) | in |
| inventory/stock | item/location balances | in (follow-up) |
| `order` | `salesOrder` | out |
| `invoice` | `invoice` | out |

Inbound presets map NetSuite fields → VANTORA (`id`/`entityId`→`external_id`,
`companyName`/`itemId`→`name`/`code`, etc.); outbound map VANTORA → NetSuite
body. Job `field_map` overrides.

## 5. Secret handling (one Vault secret, two signing keys)
TBA needs **two** secrets (`consumer_secret`, `token_secret`). To keep the
existing **single-Vault-secret** model unchanged, the dispatcher passes the one
Vault secret as a small **`consumer_secret:token_secret`** packed string; the
runtime splits it. (Same posture used elsewhere — no schema change, no second
secret column.) The two **non-secret** ids (`consumer_key`, `token_id`) +
`account_id` live in `erp_integrations.config`.

## 6. Preserved requirements
- **Two-way:** REST pull + push; `direction` per job.
- **Module/entity ownership & partial adoption:** per-entity sync jobs +
  `conflict_policy` — sync only the NetSuite records the customer adopts.
- **ERP coexistence:** NetSuite often the SMB/mid SoR (Finance/Inventory/
  Procurement); VANTORA owns CRM/Sales/Field Ops/Trade Spend/Workflow/Analytics —
  per entity.
- **Protected verticals untouched:** Clinic / Pharmacy / **Egyptian Drug List** /
  Distribution / Electrical features stay VANTORA-side; only the mapped entities
  are exchanged; conflict policy guards the rest.
- **Capability-seed slice** (CRM/Workflow/Analytics/Integrations nav gating)
  remains a separate tracked follow-up — unaffected.

## 7. Examples
- **FMCG Distribution:** NetSuite owns items, inventory, finance. VANTORA pulls
  customers + items; pushes sales orders + settlements. Routes/journey/trade spend
  stay VANTORA-side.
- **Electrical Retail & Wholesale:** NetSuite owns items/stock/finance; VANTORA
  owns POS + **multi-tier pricing / warranty / serials** (Electrical pack). In:
  items, customers; out: sales/invoices. Tier/warranty/serial stay VANTORA-side —
  never overwritten.

## 8. Verification (when built)
- **Unit (injected fetch + fixed nonce/timestamp):** OAuth 1.0a signature base
  string + HMAC-SHA256 value (against a known vector); `Authorization` header
  shape; record-API delta query build; paging; pull field-map → ingest shape;
  push body; 429/throttle + auth-error handling; secret split.
- `tsc` / `next build` / `vitest`. **No DB migration → no prod-apply gate.**
- **Live NetSuite validation deferred** to a pilot account (mock-tested until
  then — same posture as B2/B3/B5).

## 9. Decisions to confirm (before building B4)
1. **Adapter:** new **`netsuite`** (SuiteTalk REST + TBA) adapter — *Recommended*.
2. **Auth:** **TBA (OAuth 1.0a, HMAC-SHA256)** first; OAuth2 a later option?
   *(Rec — TBA is the most common NetSuite integration auth.)*
3. **Read API:** **record API** first (SuiteQL a follow-up)? *(Rec — symmetry.)*
4. **First entities:** `customer`, `vendor`→supplier, `inventoryItem`→product
   (in); `salesOrder`/`invoice` (out); stock balances a follow-up? *(Rec.)*
5. **Delta:** `lastModifiedDate` watermark + limit/offset paging? *(Rec.)*
6. **Secret packing:** one Vault secret as `consumer_secret:token_secret`
   (no schema change)? *(Rec.)*
7. **Live validation:** defer to a pilot NetSuite account; unit/mock until then?
   *(Rec.)*

*(B4 design — paused for your review. On approval I'll add the `oauth1.ts` signer
+ `netsuite` adapter → test → open a draft PR → bring back the review package; no
production apply without approval. B4 is the last adapter in the tracked B2→B5
sequence.)*
