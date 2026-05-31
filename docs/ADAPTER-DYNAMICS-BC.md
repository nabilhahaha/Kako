# VANTORA — Dynamics 365 Business Central Adapter (B2 design review)

> Build-track slice **B2** — **design for approval, no implementation yet**.
> First vendor adapter, on the proven Connector Framework (2C-1) + Sync Engine
> (2C-2) + CSV/SFTP precedent (B1). Preserves: **pull + push**, **module-level**
> and **entity-level ownership**, **partial adoption**, **ERP coexistence**, and
> **Clinic / Pharmacy / Distribution / Electrical-Retail** compatibility.

---

## 1. Scope & footprint

- **No migration.** Reuses `erp_integrations` (connection + Vault secret) and
  `erp_sync_jobs/_runs`. B2 = a registered **`dynamics_bc` adapter descriptor** +
  a **runtime** (OAuth2 + OData) + a **dispatcher branch** + field-map presets +
  tests. (So "production apply" for B2 is really just merge + the standing
  runtime env vars — no DB change.)
- **Target:** Dynamics 365 **Business Central (SaaS)** API v2.0 (OData v4).
  On-prem BC / F&O are a later extension (different base URL/auth).

## 2. Authentication — Azure AD (Entra) OAuth2 client-credentials
- Customer registers an Azure AD app; provides **tenant id, client id,
  environment, BC company id**, and a **client secret**.
- Non-secret config → `erp_integrations.config`; **client secret → Vault**
  (`secret_id`), exactly like every connection.
- Runtime fetches a token: `POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`
  (`grant_type=client_credentials`, `scope=https://api.businesscentral.dynamics.com/.default`),
  caches it for the run. **New:** a small OAuth2 token helper
  (`connectors/runtime/oauth2.ts`), fetch-based, **unit-testable** with injected
  fetch (no secret ever leaves the server; reused later by other OAuth2 vendors).

## 3. Transport — OData v4 (both directions)
- Base: `https://api.businesscentral.dynamics.com/v2.0/{tenant}/{environment}/api/v2.0/companies({companyId})/{entitySet}`.
- **Pull (inbound):** `GET` with **delta** `$filter=lastModifiedDateTime gt {cursor}`
  + `$top` paging; map OData records → VANTORA entity fields → `ingestRecord`
  (company-scoped, conflict policy). Cursor advances to max `lastModifiedDateTime`.
- **Push (outbound):** `POST`/`PATCH` VANTORA-originated rows to BC (matched by
  number/external id); both directions honored → **two-way preserved**.
- **Throttling:** respect BC `429` + `Retry-After` (recorded on the run; retried
  next tick) — same error model as 2B/2C-2.

## 4. Entity mapping (presets, extensible)
| VANTORA entity | BC entity set | Notes |
|---|---|---|
| `customer` | `customers` | name, no., email, phone → field-map preset |
| `supplier` | `vendors` | |
| `product` | `items` | item no., description, prices |
| `invoice` | `salesInvoices` | outbound (VANTORA → BC) typical |
| `order` | `salesOrders` | outbound typical |
Field maps reuse the existing `field_map` job config; presets ship with the
adapter and are overridable per job.

## 5. Preserved requirements (how B2 keeps them)
- **Pull + Push:** adapter implements both; `erp_sync_jobs.direction = in|out`.
- **Module-level ownership:** sync jobs are per **entity** (= per module's data),
  so a customer enables only the modules/entities they want synced.
- **Entity-level ownership + conflict:** per-job `conflict_policy`
  (`source_wins`/`vantora_wins`/`manual_review`) sets SoR per entity.
- **Partial adoption:** entity/module-scoped — a Sales-only or Inventory-only
  customer syncs just those BC entity sets.
- **Coexistence:** classic split — BC owns Finance/Inventory; VANTORA owns
  CRM/Sales/Field Ops/etc. (per `MODULE-OWNERSHIP-MATRIX.md`).
- **Clinic / Pharmacy:** a clinic/pharmacy on BC can sync `customers` + `items` +
  inventory **in** from BC while VANTORA owns clinical/dispensing data and the
  **Egyptian Drug List** (untouched, protected). No medical features change.
- **Distribution / Electrical Retail:** sync `customers`/`items`/stock **in**,
  push `orders`/`invoices` **out**; multi-tier pricing / warranty / serials stay
  VANTORA-side (Electrical pack) and are not overwritten by BC.

## 6. Reuse vs new
- **Reused:** dispatcher (`/api/internal/sync-tick`), `ingestRecord`, Vault
  secret resolution, sync jobs/runs + cursor/delta, audit, RLS, the connector
  registry/UI.
- **New:** `dynamics-bc-runtime.ts` (OAuth2 token + OData pull/push + mapping),
  `oauth2.ts` helper, `dynamics_bc` descriptor (config fields: tenant, client id,
  environment, company id; secret: client secret), a dispatcher branch, presets,
  and unit tests (token fetch, OData URL/`$filter` build, pull parse + map, push,
  429 handling) with injected fetch.

## 7. Verification plan (when built)
- Unit tests for OAuth2 + OData runtime (mock fetch): token acquisition, delta
  `$filter`, paging, pull→map, push, throttle handling.
- `tsc` + `next build` (confirm no new bundling issues) + vitest.
- **No DB migration** → no rolled-back live migration step; a connector
  catalog/registry presence check. Live BC sync validated post-deploy against a
  real/sandbox BC tenant (needs runtime env + a customer/sandbox tenant — like
  the `/api/v1` live smoke test).
- Draft PR + review package; **merge only after your approval** (no auto-merge).

## 8. Decisions to confirm (before building B2)
1. **First entity set:** start with **`customer` + `product` + `supplier`**
   (inbound master data — highest value, lowest risk), add `order`/`invoice`
   (outbound) next? *(Recommended.)*
2. **BC deployment:** **SaaS only** for B2 (on-prem/F&O later)? *(Recommended.)*
3. **OAuth2 helper:** build a reusable `oauth2.ts` now (used by Dynamics, later
   NetSuite OAuth2 / others)? *(Recommended.)*
4. **Live validation:** is a **BC sandbox tenant** available for a post-deploy
   smoke test, or verify by unit tests + a mock until a pilot provides one?

*(B2 design — paused for your review. On approval I'll build it on the branch,
verify, open a draft PR, and bring back the package before any
merge/runtime change.)*
