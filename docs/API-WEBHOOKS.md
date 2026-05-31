# VANTORA — API & Webhooks (integrator reference)

Inbound **REST API** (`/api/v1`) and outbound **webhooks** for external systems.
Both are gated by the **Integrations** module (`integrations.manage`) and are
fully company-scoped and audited. Architecture: [`INTEGRATION.md`](INTEGRATION.md).

---

## 1. Authentication (inbound)
- Per-company **API keys**, created in **Settings → Integrations → API Keys**
  (admin/owner). The key is shown **once** (`vtk_live_…`); only a SHA-256 hash is
  stored (Vault-grade hygiene), with a non-secret display prefix.
- Send: `Authorization: Bearer vtk_live_…`.
- **Entity-based scopes:** `{entity}:read` / `{entity}:write` (no global
  wildcard). A write to an entity requires exactly its `:write` scope.
- Keys are **revocable**; `last_used_at` is tracked.

## 2. Inbound REST API — `POST /api/v1/{entity}`
- **Enabled entities (Phase 2A):** `customer`, `supplier`, `product` (singular or
  plural path accepted). Expanding the set is a one-line server change — no
  migration.
- **Body:** a single record object, an array, or `{ "records": [...] }`.
- **Mode:** `?mode=insert|update|upsert` (default `upsert`), matched by
  `external_id`.
- **Writes reuse the entity-registry path:** validation, business rules, custom
  fields, and RLS apply identically to manual import. `company_id` comes **only**
  from the resolved key — never the body.
- **Idempotency:** send `Idempotency-Key`; a prior successful result is replayed.
- **Rate limit:** per-key rolling window (120/min) → `429` + `Retry-After`.
- **Responses:** `200` (all ok) / `422` (all failed) with
  `{ ok, total, succeeded, failed, results[] }`; errors use RFC-7807-style
  `{ type, title, status, detail }`. Every response carries `X-VANTORA-Request-Id`.
- **Logging:** every call (`ok`/`error`/`rejected`/`rate_limited`) →
  `erp_integration_logs`.

### Example
```bash
curl -X POST https://<host>/api/v1/customers \
  -H "Authorization: Bearer vtk_live_…" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 7f3a-…" \
  -d '{"name":"Acme","external_id":"a-001","email":"ops@acme.com"}'
```
A `customer:read`-only key calling this → `403`.

### Config / fail-closed
Requires `SUPABASE_SERVICE_ROLE_KEY` in the runtime env (server-only, not in the
DB). If unset, `/api/v1` returns `503` (keys + UI still work).

---

## 3. Outbound webhooks
- Subscribe in **Settings → Integrations → Webhooks** (admin/owner): a name, an
  **HTTPS** URL, and the events. A **signing secret** (`whsec_…`) is shown once.
- **Events (Phase 2B):** `customer.created/updated`, `supplier.created/updated`,
  `product.created/updated`, `invoice.created`, `approval.completed`.
- **Delivery:** `pg_cron` + `pg_net`, every minute. Each delivery is
  **HMAC-SHA256-signed**:
  - `X-VANTORA-Signature: sha256=<hex>` over the raw JSON body,
  - `X-VANTORA-Event`, `X-VANTORA-Delivery` headers.
- **Payload:** `{ id, event, entity, entity_id, occurred_at, data }`.
- **Reliability:** exponential backoff retry; after repeated failures the
  subscription is **auto-disabled** and the owner notified. A delivery log
  (status/attempts/last code) is shown in the UI.
- **Verify (receiver):** recompute `HMAC_SHA256(secret, rawBody)` and compare to
  the signature header (constant-time).

---

## 4. Notes for integrators
- All API/webhook data is **company-scoped**; a key/secret only ever sees its
  company's data (RLS).
- Entities follow the standard fields contract (`external_id` is your join key).
- For bulk/scheduled movement use the **Sync Engine** instead of per-record API
  calls — see [`SYNC-ENGINE.md`](SYNC-ENGINE.md).
