# VANTORA — Search OS Architecture (Proposal)

**Status:** Architecture only — **no implementation, no code, no migrations, no
branches.** Review first.
**Goal:** one platform-wide search capability for the entire VANTORA platform —
fast global search + scoped search across all core entities, multi-tenant-safe,
permission-aware, bilingual (Arabic + English), and ready for future semantic/AI
search.
**Design law (mirrors the Workflow Platform):** *One Index. One Query Service. One
Provider Registry. Zero duplicate search logic.* Search is a **read/projection
layer** over existing data — it owns no business logic and changes no source table.

---

## 1. Global Search architecture

A single **Search OS** with four parts:

```
 Domain data (erp_customers, erp_products, … 10 entities)
        │  (a) backfill (pg_cron, batched)   (b) incremental (erp_events bus)
        ▼
   Search Index — erp_search_documents (denormalized, one row per searchable record)
        │  search_vector tsvector (FTS) + trigram text (fuzzy) + metadata jsonb
        ▼
   Query Service — search(query, scope, ctx)  → parse → FTS+trigram → rank → gate
        │  RLS (company/branch) + per-entity permission filter + source-RLS on hydrate
        ▼
   Surfaces — Global command palette (⌘K) · scoped entity search · API
```

- **Unified index table `erp_search_documents`** (denormalized): `id`,
  `entity_type` (one of the 10), `entity_id`, `company_id`, `branch_id`,
  `title`, `subtitle`, `body`, `search_vector tsvector`, `trgm_text text`
  (name/code/phone for fuzzy + typeahead), `permission_key text`, `metadata jsonb`
  (status, amounts, dates for filters/ranking), `updated_at`, and a **reserved**
  `embedding` column for Phase 4 (semantic). One row per searchable record; the
  index is a *projection*, never the source of truth.
- **Search Provider Registry** (the "one registry" discipline, mirroring the
  workflow executor registry): one **provider per entity_type** declaring how to
  project a source row → a search document — which fields map to title/subtitle/
  body, field **weights** (A/B/C/D), the `permission_key`, the deep-link route, and
  the originating domain events. Adding a new searchable entity = registering one
  provider (+ enabling its events), not new query/index code.
- **Query Service** — a single `search()` entry (server action + `/api/search`):
  builds a `websearch_to_tsquery` over `search_vector` **plus** a `pg_trgm`
  similarity pass for fuzzy/prefix, ranks, applies the security model, groups
  results by entity, and returns typed, deep-linkable hits.
- **Surfaces** — a global command palette (top-bar ⌘K) for cross-entity search,
  per-module scoped search reusing the same service, and the API for future
  consumers (Copilot).

---

## 2. Search scope (10 entities → 10 providers)

| Entity | Source | Title / Subtitle | Fuzzy keys (trgm) | Permission key |
|---|---|---|---|---|
| **Customers** | `erp_customers` | name / code · phone | name, code, phone | `customers.view` |
| **Products** | `erp_products` | name / SKU · barcode | name, sku, barcode | `products.view` |
| **Suppliers** | `erp_suppliers` | name / code | name, code | `suppliers.view` |
| **Orders** | `erp_sales_orders` | order # / customer · status | order_number | `sales.view` (orders) |
| **Invoices** | `erp_invoices` | invoice # / customer · amount | invoice_number | `invoices.view` |
| **Returns** | `erp_sales_returns` | return # / customer | return_number | `returns.view` |
| **Visits** | `erp_visits` | customer / rep · date | — | `visits.view` |
| **Workflows** | `erp_workflow_definitions` | name / key · entity | key | `workflow.manage` |
| **Attachments** | `erp_attachments` | filename / entity link | filename | inherits parent entity perm |
| **Users** | `erp_profiles` (+ auth) | name / email · role | name, email | `staff.view` / platform-owner |

(Exact permission keys to be confirmed against `capabilities.ts`; Attachments
inherit the permission of the record they're attached to — a per-document
`permission_key` resolved at projection time.)

---

## 3. Search permissions & security model (defense in depth)

Three independent gates, all must pass:
1. **RLS on `erp_search_documents`** — tenant policy (`company_id =
   erp_user_company_id()` OR platform owner), `(select auth.uid())` form. A query
   physically cannot read another tenant's documents.
2. **Per-entity permission filter** — each document carries `permission_key`; the
   Query Service intersects results with the caller's capabilities
   (`hasPermission(ctx, key)`), so a user only sees entity types they may view
   (e.g., a rep without `invoices.view` never sees invoice hits).
3. **Source-table RLS on hydration** — when a result is opened/expanded, the source
   row is read through its own RLS, so the index can never leak a field the user
   couldn't otherwise read. The index stores only display-safe fields.

Audit: searches can emit a `search.performed` event (query, scope, result count —
**never** result PII) for analytics/abuse detection, reusing the event bus.

---

## 4. Multi-tenant isolation

- `company_id` on **every** document + RLS (same primitives as the rest of the
  platform: `erp_user_company_id()`, `erp_is_platform_owner()`).
- **Branch scoping** via `branch_id` + `erp_has_branch_access()` for branch-scoped
  roles; company-wide records carry `branch_id = null`.
- **Platform owner** may search across tenants (explicit, audited) for support.
- The projector/backfill writes documents **under the originating tenant context**
  (service-role writes set `company_id` explicitly; incremental writes reuse the
  workflow **impersonation** helper so tenant context is correct) — no cross-tenant
  bleed at index time.

---

## 5. Ranking & relevance strategy

A composite score, computed in SQL + light post-processing:
- **Lexical relevance:** `ts_rank_cd(search_vector, query)` with **field weights** —
  A = name/code/number (identity), B = key attributes (phone/SKU/status), C = body,
  D = metadata.
- **Fuzzy/prefix boost:** `similarity(trgm_text, query)` (pg_trgm) for typo-tolerance
  and typeahead; exact-prefix and exact-code matches get a strong boost (so typing
  an invoice number jumps it to the top).
- **Recency decay:** newer records (by `updated_at`) ranked higher via a time-decay
  factor — recent orders/invoices/visits matter most.
- **Entity prior:** configurable per-entity weight (e.g., customers/products
  slightly favored in global search) — tunable, not hard-coded.
- **Optional popularity:** per-tenant open/click counts can feed a learned boost
  later (Phase 3+), stored in `metadata`.
- **Tie-breakers:** exact match → prefix → recency → entity prior. Deterministic.

Relevance config lives in the **provider** (weights) + a small tunables table —
adjustable without code changes.

---

## 6. Search performance & indexing strategy

- **FTS:** `GIN(search_vector)`; queries always carry the `company_id` predicate so
  the planner combines the tenant filter with the GIN scan.
- **Fuzzy/typeahead:** `GIN(trgm_text gin_trgm_ops)` — **`pg_trgm` is already
  enabled** on the platform. Supports typo-tolerance and is **Arabic-friendly**
  (trigram matching works without a language-specific FTS dictionary).
- **Bilingual text:** index with the `simple` config (+ `unaccent`, a new
  extension, to fold Arabic/Latin diacritics) so Arabic and English both tokenize;
  trigram covers morphology gaps. (Postgres ships no Arabic FTS dictionary, so
  FTS-`simple` + trigram is the pragmatic bilingual approach.)
- **Freshness pipeline (two paths):**
  - **(a) Backfill / reconcile:** a batched `pg_cron` job (pg_cron is enabled)
    (re)projects source rows → documents for cold start and drift repair — the same
    "tick/sweep" discipline as the workflow runtime.
  - **(b) Incremental (near-real-time):** the **`erp_events` bus** drives a search
    **projector** that upserts/deletes a document on `*.created/updated/deleted`
    events (see §8). Debounced; idempotent upsert keyed by `(entity_type, entity_id)`.
- **Write amplification:** one extra denormalized upsert per source mutation
  (cheap); the index is eventually-consistent within the projector latency.
- **Targets (design goals):** typeahead p95 < 150 ms; global search p95 < 400 ms;
  index freshness < a few seconds via the bus, with cron reconcile as backstop.
- **Index size:** display-only fields kept small; large bodies truncated; partial
  indexing of archived/inactive records optional.

---

## 7. Future AI / semantic search compatibility

The design is **hybrid-ready** from day one without rework:
- Add an `embedding vector(N)` column to `erp_search_documents` (enable **pgvector**
  — not yet installed) + an **HNSW** index.
- A projector step generates embeddings (title+body) — model called via the
  **Workflow egress allow-list** (reuse: approved providers only, tenant-scoped,
  audited) or a local model; flag-gated and optional.
- **Hybrid retrieval:** combine lexical (FTS+trgm) and vector (semantic) candidates
  via **reciprocal-rank fusion**, then rerank — same `search()` entry, same table,
  same security gates. Natural-language queries ("overdue invoices for Cairo
  customers") become a Copilot layer over the same index.
- No schema redesign needed — semantic is an additive column + an additional
  retrieval arm.

---

## 8. Reuse of existing Workflow Platform capabilities

Search OS deliberately reuses the platform's proven primitives — no new infra:
- **Event bus (`erp_events`)** = the freshness pipeline. The search projector is a
  second **consumer** of the same domain events the workflow dispatcher consumes
  (`customer.*`, `product.*`, `invoice.*`, `order.*`, `return.*`, `visit.*`, …) —
  one event stream, two consumers, zero duplicate emission.
- **Provider-registry discipline** mirrors the executor registry (one provider per
  entity; closed, central set).
- **`pg_cron` tick** for backfill/reconcile mirrors the workflow runtime tick.
- **Impersonation helper** (`sync/server/impersonate`) for tenant-correct
  incremental indexing.
- **Egress allow-list** governs any external embedding/model calls (Phase 4).
- **RLS + permission primitives** (`erp_user_company_id`, `erp_is_platform_owner`,
  `erp_has_branch_access`, `hasPermission`) reused verbatim.
- **Flag-gated rollout** discipline (`KAKO_SEARCH_*` default OFF) and additive,
  branch-validated migrations — same release playbook.

> New domain events needed for entities that don't yet emit (products/suppliers/
> visits/attachments/users) are added to the catalog the same way as for workflows
> — additive, no engine change.

---

## 9. Estimated implementation phases

| Phase | Scope | Effort | Risk |
|---|---|---|---|
| **P0 — Architecture** (this doc) | design + review | — | — |
| **P1 — Index + core search** | `erp_search_documents` (additive migration) + provider registry + providers for Customers/Products/Suppliers/Orders/Invoices + FTS query service + **global command palette**; flag-gated OFF; **cron backfill only** | Medium | Low (additive, flagged) |
| **P2 — Event-driven + full scope** | search projector on the `erp_events` bus (incremental) + ranking tuning + remaining providers (Returns/Visits/Workflows/Attachments/Users) + scoped search | Medium | Low–Med |
| **P3 — Fuzzy/bilingual + UX** | `pg_trgm` typeahead + `unaccent` Arabic folding + filters/facets + search analytics (`search.performed`) | Medium | Low |
| **P4 — Semantic/AI (optional)** | `pgvector` embedding column + HNSW + hybrid RRF + Copilot NL layer (egress-governed) | Medium–High | Med (new extension + model) |

Each phase: `tsc`/suite/build green, additive migration branch-validated on a pure-
main Supabase branch, FK-coverage + wrapped-`auth.uid()` invariants, flag default
OFF.

---

## 10. Business value & ROI

- **Time-to-find collapses:** one ⌘K box reaches any customer/product/invoice/order
  across modules in < 1s — replacing per-module list-filtering and navigation.
- **Fewer clicks, faster ops:** reps/cashiers/admins jump straight to records;
  measurable reduction in task time (find-customer, find-invoice, find-product).
- **Cross-module discovery:** a single query surfaces related orders, invoices,
  returns, visits, and attachments for an entity — context without hunting.
- **Support deflection & onboarding:** new users find features/records without
  training; fewer "where is X" tickets.
- **Platform leverage:** one search capability serves every current and future
  module (CRM/Finance/Inventory/Procurement/HR/Service) — build once, reuse
  everywhere, exactly like the Workflow Platform.
- **AI foundation:** the same index powers a future natural-language Copilot
  (semantic search) with no rebuild — protecting the investment.
- **Low cost/risk:** reuses existing extensions (`pg_trgm`, `pg_cron`) and the
  event bus; additive + flag-gated; no source-table changes.

---

## Open questions for review

1. **Index model:** unified `erp_search_documents` (recommended) vs per-entity
   `tsvector` columns on each source table? (Unified = one query path, one security
   model, semantic-ready; per-entity = no projector but N query paths + weaker
   global ranking.)
2. **Bilingual approach:** confirm `simple` FTS + `unaccent` + trigram is acceptable
   for Arabic (no Arabic FTS dictionary in Postgres), or evaluate an alternative.
3. **Permission keys:** confirm the exact capability keys per entity against
   `capabilities.ts` (esp. Users/Attachments).
4. **Phase 4 scope:** is semantic/AI in scope for V1 of Search OS, or a later track?
5. **New events:** approve adding catalog events for non-emitting entities
   (products/suppliers/visits/attachments/users) for incremental indexing.

*Architecture only — no implementation, code, migrations, or branches. Awaiting
review.*
