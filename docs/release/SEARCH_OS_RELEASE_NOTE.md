# VANTORA — Search OS Release Note (V1, Phase 1)

**Release:** Search OS **Phase 1** — platform-wide global search.
**Merged to `main`:** PR #129 (squash `d9e60c4`), base `main` `7e29b53`.
**Status:** Shipped, **flag-gated OFF** (`KAKO_SEARCH`) → zero behavior change until
rollout. **No semantic/AI/vector/Copilot** (excluded from V1).
**Discipline:** reuse-over-rebuild · additive migration · multi-tenant isolation +
existing permission model preserved.

---

## What shipped

- **Unified search index** (`0185`): `erp_search_documents` (denormalized
  projection; not a source of truth) + GIN FTS / trigram / identifier indexes +
  tenant **RLS** + `unaccent` + a maintenance trigger + the entity-neutral
  **`erp_search()` ranking RPC** (SECURITY INVOKER → RLS tenant-isolates;
  `p_types` gates categories).
- **Provider registry** — one provider per entity (the single column-aware layer);
  **query service** (permission-gated, categorized); **classify** (query
  classification + identifier/phone normalization); **backfill** (provider-driven
  reindex, cron-triggered).
- **Command palette extended** (existing in-app palette) with a flag-gated
  records-search mode: debounced `/api/search`, ⌘K, mobile `inputmode`, categorized
  results, deep-link navigation. Platform-owner palette + module pages untouched.
- **APIs:** `/api/search` (query) and `/api/internal/search-reindex` (cron backfill;
  no-op while OFF) + a daily reindex cron.

## Capabilities (V1)

Global + **categorized** results · customer / product / supplier / order / invoice /
return / visit / workflow search · **code** · **barcode** · **phone**
(format-agnostic) · **VAT** (`tax_number`) · **deep-link navigation**.

## Feature flags (all DEFAULT OFF)

| Flag | Enables |
|---|---|
| `KAKO_SEARCH` | the global search surface (index query + palette records mode) |
| `KAKO_SEARCH_LIVE` | P2 event-driven incremental indexing (defined, unused in V1) |
| `KAKO_SEARCH_UX` | P3 fuzzy/typeahead/analytics polish (defined, unused in V1) |

With all flags unset, the command palette behaves exactly as before this release.

## Excluded / deferred (documented)

Semantic / embeddings / vector / Copilot (not in V1). **Attachment + User backfill**
deferred (providers registered; need a parent-route map / tenant-membership source).
CR (`cr_number`) not on `main` yet (VAT works today). Order/visit are RLS-only (no
dedicated capability key). Incremental indexing is P2.

## Rollout (when approved)

1. Run `/api/internal/search-reindex` (or wait for the daily cron) to backfill the
   index on staging.
2. Enable `KAKO_SEARCH` in staging; verify categorized results, identifier search,
   deep-links, tenant isolation, latency; then promote to production.
3. Production migration apply remains the guarded manual step.
4. Follow-ups: attachment/user backfill → P2 (`KAKO_SEARCH_LIVE`) → P3 (`KAKO_SEARCH_UX`).

---

## Post-merge confirmation

- **`main` after merge:** _confirmed green_ (CI on `d9e60c4` — see PR thread / CI run).
- **Migrations:** `0185` applied to STAGING via CI ✓ and applied in the integration
  full-chain (bootstrap + migrations) ✓; production apply is the guarded manual step.
- **Feature flags:** `KAKO_SEARCH` / `_LIVE` / `_UX` remain **OFF by default**
  (true only when the env var is explicitly set).
