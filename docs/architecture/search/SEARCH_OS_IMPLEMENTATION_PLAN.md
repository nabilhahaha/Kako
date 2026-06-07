# VANTORA — Search OS Implementation Plan (V1)

**Status:** Planning only — **no implementation yet.** Follows the approved
`SEARCH_OS_ARCHITECTURE.md`.
**Approved decisions baked in:** (1) **unified index** (`erp_search_documents`);
(2) **Arabic + English in V1**; (3) **reuse existing permission keys**;
(4) **NO semantic/vector in V1**; (5) **approve catalog events for all searchable
entities**.
**Playbook (unchanged):** additive migrations, flag-gated **OFF** by default,
branch-validated on a pure-`main` Supabase branch, `tsc`/suite/build green per phase.

---

## 0. Grounding facts (verified on `main` after the #126 merge)

- **Event bus is now on `main`:** `erp_events` (`0176`), `emit()`/dispatcher/event
  catalog all landed via PR #126 → the search projector can reuse them.
- **Producers are NOT on `main` yet:** the `recordEvent(...)` call sites in business
  actions were part of the excluded offline-sync work. **Incremental indexing
  therefore depends on adding producers** (decision 5 covers this). **`pg_cron`
  backfill needs no producers**, so V1 can start without them.
- **Extensions:** `pg_trgm` ✅ and `pg_cron` ✅ already enabled; **`unaccent` must be
  enabled** (new) for Arabic/Latin diacritic folding; **no `pgvector`** (not needed —
  semantic is out of V1).
- **Permission keys present:** `customers.view/manage`, `suppliers.view/manage`,
  `workflow.manage`. Others (products/sales/invoices/returns/visits/users) are
  **module-gated**, not dedicated `*.view` keys → see Dependency D3.

---

## 1. Phases (V1 = P1–P3; semantic deferred)

### P1 — Unified index + core FTS + global palette (foundation)
- Migration **S1** (`erp_search_documents` + indexes + RLS) and **S2** (projector
  checkpoint table). Enable `unaccent`.
- **Provider registry** + providers for the 5 highest-value entities: Customers,
  Products, Suppliers, Orders, Invoices.
- **Backfill** via a `pg_cron` job (batched, tenant-correct) — populates the index
  with **no producer dependency**.
- **Query service** (`search()` + `/api/search`): `websearch_to_tsquery` over
  `search_vector` + `pg_trgm` similarity (bilingual), ranking, security gates.
- **Global command palette (⌘K)** behind `KAKO_SEARCH` (OFF).
- *Gate:* index populates; palette returns correct, permission-filtered, tenant-
  isolated results.

### P2 — Event-driven incremental + full entity scope
- **Add domain event producers** (`recordEvent`) to create/update/delete on all
  searchable entities (decision 5) + extend the **event catalog** with the missing
  types (products/suppliers/visits/workflows/attachments/users; customers/orders/
  invoices/returns/visits types already defined).
- **Search projector**: a second consumer of `erp_events` that upserts/deletes
  documents (idempotent, keyed by `(entity_type, entity_id)`), with a `pg_cron`
  **reconcile sweep** (cursor in S2) as backstop. Behind `KAKO_SEARCH_LIVE` (OFF).
- Remaining providers: Returns, Visits, Workflows, Attachments, Users.
- *Gate:* a source mutation reflects in search within seconds; reconcile repairs drift.

### P3 — Bilingual UX + relevance + analytics
- Arabic polish (`unaccent` folding + trigram typeahead), prefix/exact boosts,
  recency decay, entity priors; scoped/faceted search; `search.performed` analytics
  event (no PII). Behind `KAKO_SEARCH_UX` (OFF).
- *Gate:* typeahead p95 < 150 ms, global p95 < 400 ms; Arabic + English queries
  both return relevant results.

### P4 — Semantic / vector — **OUT OF V1** (decision 4)
Explicitly deferred. The table/query are designed so an additive `embedding
vector(N)` column + `pgvector` + hybrid RRF can be added later **without rework**.
Not built in V1.

---

## 2. Migrations (all additive)

| ID | Phase | Contents |
|---|---|---|
| **S1** `erp_search_documents` | P1 | table: `id`, `entity_type`, `entity_id`, `company_id`(FK→erp_companies), `branch_id`(FK→erp_branches), `title`, `subtitle`, `body`, `trgm_text`, `permission_key`, `metadata jsonb`, `search_vector tsvector`, `updated_at`. **No `embedding` column in V1.** Indexes: `GIN(search_vector)`, `GIN(trgm_text gin_trgm_ops)`, covering indexes for `company_id` + `branch_id` FKs, `UNIQUE(entity_type, entity_id)`. **RLS** tenant policy (`company_id = erp_user_company_id()` / platform owner) using `(select auth.uid())`. `search_vector` maintained by a `BEFORE INSERT/UPDATE` trigger using `to_tsvector('simple', unaccent(weighted text))` (A/B/C/D weights). `enable extension unaccent`. |
| **S2** `erp_search_index_state` | P1/P2 | projector checkpoint: `(scope/key, last_seq bigint, updated_at)` so the reconcile sweep resumes from the last processed `erp_events.seq`. RLS/owner as appropriate. |
| **(TS, not a migration)** | P2 | extend `event-types.ts` catalog with new entity events; add `recordEvent` producer calls. |

Every new FK gets a covering index; every policy uses `(select auth.uid())` — to
pass the schema-health invariants. Numbering: next free `01xx`/`02xx` after the
merged `0184` (assigned at implementation time).

---

## 3. Dependencies

- **D1 — `unaccent` extension** (new): required for Arabic/Latin diacritic folding
  in V1. Enable in S1 (Supabase supports it).
- **D2 — Event producers (P2):** incremental indexing needs `recordEvent` on entity
  mutations (absent on `main`). P1 works on `pg_cron` backfill alone; P2 adds
  producers. These producers also benefit the Workflow Platform (shared bus).
- **D3 — Permission keys (decision 3):** map each entity to an **existing** key.
  Confirmed: `customers.view`, `suppliers.view`, `workflow.manage`. **To confirm/
  standardize:** products, orders/sales, invoices, returns, visits, users — where no
  dedicated `*.view` key exists, gate by the **module capability** already used in
  `navigation.ts`/`capabilities.ts` for that area. Each provider stores the resolved
  `permission_key`; Attachments inherit the parent entity's key. *(No new keys —
  reuse only.)*
- **D4 — Source schema read access:** projector/backfill read source tables under
  service-role + tenant impersonation (reuse `sync/server/impersonate`).
- **D5 — `pg_trgm`, `pg_cron`** — already enabled (no action).

---

## 4. Risks & mitigations

| Risk | Sev | Mitigation |
|---|---|---|
| **Arabic FTS** (no Postgres Arabic dictionary) | Med | `simple` config + `unaccent` + `pg_trgm` trigram (decision 2); validate on real Arabic names early in P1. |
| **Producers missing on `main`** → no live updates | Med | P1 ships on `pg_cron` backfill (no producers); P2 adds producers + reconcile sweep so the index is correct even before full producer coverage. |
| **Permission-key gaps** for some entities | Med | D3: reuse module-gating where no `*.view` key exists; confirm mapping before P1 coding; default-deny if unmapped (entity hidden from search until mapped). |
| **Write amplification / index size** | Low–Med | one denormalized upsert per mutation; truncate `body`; optional skip of archived rows; monitor index size. |
| **Backfill cost on large tenants** | Low | batched `pg_cron`, off-peak, resumable via S2 cursor. |
| **Stale/orphaned documents** | Low | delete-on-`*.deleted` events + reconcile sweep; `UNIQUE(entity_type, entity_id)` upsert. |
| **Cross-tenant leakage** | High→Low | three gates (index RLS + `permission_key` filter + source RLS on hydrate); tenant-isolation integration test before enabling any flag. |
| **Ranking quality (bilingual)** | Med | tunable weights/priors in the provider + a tunables table; iterate in P3 with real queries. |

---

## 5. Rollout plan (flag-gated, staged)

Flags default **OFF** (zero behavior change on merge):
1. **`KAKO_SEARCH`** — index + query service + palette (read path). Enable after
   backfill populates staging; soak.
2. **`KAKO_SEARCH_LIVE`** — event-driven projector (incremental). Enable after
   producers land + reconcile verified; never before `KAKO_SEARCH`.
3. **`KAKO_SEARCH_UX`** — fuzzy/typeahead/facets/analytics polish.

Order: **backfill → read (KAKO_SEARCH) → live (KAKO_SEARCH_LIVE) → UX**, each
staging-soaked before production. Production migration apply remains the guarded
manual step. Instant rollback = unset the flag (additive schema stays inert).

---

## 6. Validation gates (per phase — same as the Workflow Platform)

- `tsc --noEmit` clean; full unit/integration suite green; production build clean.
- Each migration (`S1`, `S2`) **branch-validated on a pure-`main` Supabase branch**:
  applies in order; **FK-coverage invariant** clean (every new FK covered);
  **no unwrapped `auth.uid()`**; objects present; then the branch is deleted.
- **Security tests:** tenant isolation (no cross-company results); permission filter
  (entity hidden without its key); source-RLS hydration (no field leakage).
- **Functional:** backfill populates; (P2) a mutation reflects within seconds +
  reconcile repairs injected drift; (P3) Arabic + English queries return relevant,
  correctly-ranked results; latency targets met.
- Flags default OFF verified (no behavior change when unset).

---

## 7. Sequencing summary

`P1 (S1+S2 + 5 providers + backfill + palette, KAKO_SEARCH OFF)` →
`P2 (producers + catalog events + projector + remaining providers, KAKO_SEARCH_LIVE OFF)` →
`P3 (bilingual UX + ranking + analytics, KAKO_SEARCH_UX OFF)`.
**Semantic/vector = post-V1**, additive, no rework.

*Planning only — no implementation, code, or migrations created. Awaiting approval
to begin P1.*
