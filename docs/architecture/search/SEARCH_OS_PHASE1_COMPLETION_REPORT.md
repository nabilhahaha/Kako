# VANTORA — Search OS Phase 1 Completion Report

**Status:** ✅ Phase 1 implemented, **flag-gated OFF** (`KAKO_SEARCH`) → zero
behavior change until rollout. Built to the approved architecture, plan, and
screen tree; branch `claude/search-os-phase1` → `main`.
**Discipline:** reuse-over-rebuild · additive migration · multi-tenant isolation +
existing permission model preserved · **no semantic/AI/vector/Copilot**.

---

## Implementation order (as requested)

1. **Search index foundation** — migration **`0185`**: `erp_search_documents`
   (unified, denormalized index), GIN FTS + GIN trigram + GIN identifiers indexes,
   tenant **RLS** (`(select auth.uid())`), `unaccent` enabled, a trigger that
   maintains `search_vector` (`simple` + `unaccent`, weighted A/B/C) and
   `trgm_text`, and the **`erp_search()` ranking RPC** (SECURITY INVOKER → RLS
   tenant-isolates; `p_types` gates categories). The SQL is **entity-neutral** —
   no source-table column knowledge.
2. **Core providers** — `src/lib/search/providers.ts`: one provider per entity (the
   single place with column knowledge), projecting rows → documents
   (title/subtitle/identifiers/href/permission_key/metadata). 8 backfilled now;
   attachment + user registered (see Deferred).
3. **Search service** — `src/lib/search/service.ts`: gates categories by reused
   permission keys → calls `erp_search` → groups into categorized results. Pure
   `groupHits` + classify helpers unit-tested.
4. **Command palette integration** — **extended** the existing in-app palette
   (`components/layout/command-palette.tsx`): flag-gated records-search mode
   (debounced `/api/search`, ⌘K, mobile `inputmode`), platform-owner palette + all
   module pages untouched. `/api/search` + `/api/internal/search-reindex` routes.
5. **Categorized results** — results grouped by entity (provider order) with
   per-category counts + icons + highlighted titles; deep-link `href` per hit;
   combined keyboard navigation across records + pages.
6. **Permissions validation** — defense in depth: index **RLS** (tenant) +
   per-category **permission gate** (reused keys) + **source-table RLS on the
   destination page**. `allowedTypes`/gating unit-tested; RLS invariant validated
   on a Supabase branch.
7. **Performance validation** — GIN indexes for FTS/trigram/identifiers; ranking +
   matching proven on the branch (exact/prefix/lexical/fuzzy); debounced client;
   canvas-free lazy cost (palette unchanged when flag OFF).
8. **Rollout gates** — `KAKO_SEARCH` default OFF; daily `search-reindex` cron added
   (no-ops while OFF); migration additive + branch-validated.

---

## Capabilities delivered (V1)

Global search · **categorized results** · customer/product/supplier/order/invoice/
return/visit/workflow search · **code** search · **barcode** search · **phone**
search (format-agnostic: leading-zero/last-10 variants) · **VAT** search
(`tax_number`) · **deep-link navigation**. (CR/`cr_number` is **not present on
`main`** yet — a post-0160 desktop-track column — so CR matching activates
automatically once that column lands; VAT works today.)

---

## Validation (all green)

- **Migration `0185` — validated on an isolated pure-`main` Supabase branch:**
  applied cleanly; seeded docs proved text→lexical, code→exact, **barcode→exact**,
  **VAT→exact**, **phone (local)→exact + prefix**, doc-number→prefix, type-filter,
  empty; **FK-coverage invariant clean (0)** and **no unwrapped `auth.uid()` (0)**.
  Branch deleted.
- **`tsc --noEmit`** clean · **suite 758 passed / 24 skipped** (+13 search:
  classify/providers/service incl. permission-gating + grouping + RPC-call shape) ·
  **production build clean** (`/api/search`, `/api/internal/search-reindex` built).
- **i18n** ar/en parity holds (new `search` module).

---

## Reuse (no rebuild)

Extended the existing command palette + topbar trigger; reused RLS/permission
primitives (`erp_user_company_id`, `erp_is_platform_owner`, `hasPermission`),
`pg_trgm`, the Vercel cron mechanism, and the flag-gated additive-migration
playbook. Platform-owner palette and module pages unchanged.

---

## Deferred / known limitations (documented, not blocking)

- **Attachment + User backfill** — providers are **registered** (categories appear
  once populated) but **not backfilled in this turn**: attachments need a
  parent-entity → route map; users (`erp_profiles` is global) need a confirmed
  tenant-membership source. Small follow-up within Phase 1.
- **Permission keys** — entities without a dedicated capability key (order, visit)
  are **RLS-only** (tenant-scoped, no extra category gate); invoices/returns reuse
  `accounting.view`, products `inventory.view`. Per-entity capability gating beyond
  RLS is a refinement (does not weaken tenant isolation).
- **Phone `+country-code` queries** — local formats (with/without leading 0,
  last-10) match; an explicit `+20…` prefixed query is a minor edge (P3 UX
  normalization).
- **Incremental indexing** — V1 uses **backfill/reconcile** (cron) only; live
  event-driven indexing is P2 (`KAKO_SEARCH_LIVE`, defined OFF) and depends on
  domain event producers (the bus is on `main`; producers were excluded with the
  offline-sync work).
- **Deep-links** — detail routes used where they exist (`/customers/[id]`,
  `/suppliers/[id]`); others deep-link to the module list with `?focus=` (route
  validation is part of the build).

---

## Files

- **New:** `supabase/migrations/0185_search_index.sql`; `src/lib/search/{flags,types,classify,providers,service,backfill,search.test}.ts`; `src/app/api/search/route.ts`; `src/app/api/internal/search-reindex/route.ts`; `src/lib/i18n/messages/search.ts`.
- **Changed:** `src/components/layout/command-palette.tsx` (records mode), `src/app/(app)/layout.tsx` (flag prop), `src/lib/i18n/messages/index.ts` (register `search`), `vercel.json` (reindex cron).

---

## Rollout (when approved)

1. Apply `0185` to staging (CI) → run `/api/internal/search-reindex` (or wait for
   the daily cron) to backfill.
2. Enable `KAKO_SEARCH` in staging; verify categorized results, identifier search,
   deep-links, tenant isolation; measure latency.
3. Promote to production; production migration apply remains the guarded manual step.
4. Follow-ups: attachment/user backfill; then P2 (`KAKO_SEARCH_LIVE`) + P3
   (`KAKO_SEARCH_UX`).

*Phase 1 complete and validated. No semantic/AI in V1. Stopping for review.*
