# Standard List Architecture (S1) — one reusable list framework

*VANTORA platform · **FINAL / authoritative** — every existing and future large-list screen MUST follow this pattern · review-first. No merge, no production migrations.*

---

## 1. Goal
One reusable list framework across the platform: **server pagination, server search, sortable columns, URL-persisted state, mobile-friendly paging, filtered export, and a count strategy that scales** — applied uniformly to every large-list entity. Transactional lists (Invoices/Orders) already used this shape; S1 **codifies it into shared helpers** and rolls it out.

## 2. The framework (codified)
**Shared helper — `src/lib/erp/list-query.ts`:**
- `parseListParams(sp, pageSize)` → `{ page, q, pageSize, from, to }` (URL `?page=&q=`).
- `applySearch(query, q, cols)` / `buildOrIlike` → server `ilike` across columns (sanitized).
- `parseSort(sp, allowedCols, default)` → `{ column, ascending }` (URL `?sort=&dir=`, **allow-list guarded**).
- `recommendedCountMode(expectedRows)` → `'exact' | 'planned'` count strategy.
- `pageCount(total, pageSize)`.

**Shared components:** `<ListSearch>` (debounced URL `?q=`), `<Pager>` (URL `?page=`, preserves filters), and a **`<SortableHeader>`** (design — toggles `?sort/?dir`).

**Page recipe (every list):**
```ts
const { page, q, pageSize, from, to } = parseListParams(sp);
const sort = parseSort(sp, SORTABLE, { column: 'code', ascending: true });
let qb = supabase.from(TABLE).select('*', { count: COUNT_MODE }).order(sort.column, { ascending: sort.ascending });
qb = applySearch(qb, q, SEARCH_COLS);
const { data, count } = await qb.range(from, to);
// render rows + <ListSearch> + <Pager total={count} query={{ q, sort, dir }} />
```
Only **one page** of rows is fetched → list cost is independent of table size (bounded by indexes).

## 3. Requirement coverage
| Requirement | How |
|---|---|
| **Server pagination + search** | `parseListParams` + `applySearch` + `.range()` + `<Pager>`/`<ListSearch>` |
| **Sort by any column** | `parseSort` (allow-list guarded) + `<SortableHeader>` (UI) |
| **Default sort per entity** | each page passes its default `SortParam` |
| **URL persistence (filter/search/page/sort)** | all state lives in the URL — shareable, bookmarkable, back-button safe ✅ |
| **Saved filters (future-ready)** | URL params *are* the filter state → a saved view is just a stored query string. Design: `erp_list_views(user_id, company_id, entity, name, params jsonb)` |
| **Mobile-friendly pagination** | `<Pager>` is responsive (prev/next + "x/y"); polish: larger tap targets, compact on mobile |
| **Export only current filtered results** | a shared `exportList(table, { q, searchCols, sort, filters, columns })` re-applies the **same filters** and streams **all matching rows** (batched via `.range()`), not just the page |
| **Exact vs estimated count** | `recommendedCountMode` — `exact` ≤ ~100k, `planned` (instant planner estimate) for very large tables |

## 3a. Deep-linking & consistent states (required for every list)
- **Deep-link / shareable URLs** ✅ — because *all* state (search, filters, sort, page) is in the query string, any filtered/sorted/paged view is a shareable, bookmarkable, back-button-safe deep link. No hidden client state.
- **Loading state** — app-level `loading.tsx` renders `PageSkeleton`; lists should show a skeleton/spinner on navigation. *(Standard.)*
- **Error state** — app-level `error.tsx` (Sentry + retry) keeps the shell; server actions return friendly strings (`friendlyDbError`) surfaced via `toast`. *(Standard.)*
- **Empty vs no-result** — one shared `EmptyState`, message **driven by whether a search/filter is active**: *no results* when `q`/filters are set, *empty (with a "New …" CTA)* when the table is genuinely empty. Rolling out across all entities (Products/Suppliers/Inventory done).
- **Future saved views / favorite filters** — since a view = a query string, a saved view is just a stored URL. Design: `erp_list_views(id, user_id, company_id, entity, name, params jsonb, is_shared)` + a small picker; tenant-scoped. *(Future-ready, Can-Wait.)*

## 4. Per-entity plan (current → standard)
| Entity | Current pattern | Page size | Search cols | Default sort | Count | Status |
|---|---|--:|---|---|---|---|
| **Products** | client in-memory filter, unbounded | 25 | code,name,name_ar,barcode | code ↑ | exact | ✅ **DONE** |
| **Suppliers** | client in-memory filter, unbounded | 25 | code,name,name_ar,phone | code ↑ | exact | ✅ **DONE** |
| **Customers** | capped 2000 (M3) + per-row redaction | 25 | code,name,name_ar,phone | code ↑ | exact→planned >100k | next |
| **Inventory** | all stock combos + client filter | 50 | product code/name | product ↑ | exact→planned | next |
| **Invoices** | server `.range()` (20) | 25 | invoice_number (+customer) | created_at ↓ | exact | conform to helper |
| **Orders** | server `.range()` (20) | 25 | order_number (+customer) | created_at ↓ | exact | conform to helper |
| **Returns** | list | 25 | return_number | created_at ↓ | exact | rollout |
| **Visits** | list | 50 | customer/date | visit_date ↓ | exact→planned | rollout |
| **Routes** | small list | 50 | name | name ↑ | exact | rollout (paging optional) |
| **Approval Requests** | inbox | 25 | entity/title | created_at ↓ | exact | rollout |

**Search strategy:** **server-side for every large list** (filters the whole table, not just the page). Client-side filtering is acceptable only for inherently tiny, fully-loaded lists (e.g. lookups, routes).

## 5. Scalability & performance — before vs after
| | Before (unbounded) | After (paginated) |
|---|---|---|
| Rows fetched / request | **all** (e.g. 50k) | **one page** (25–50) |
| Memory / serialization | grows with table | constant |
| Customers per-row redaction | every row | **page only** (S2) |
| DB work | full scan + sort | index range scan (uses 0110 indexes) |
| Remaining cost at scale | — | the `count: exact` query → switch to `planned` for >~100k |
| **Effective ceiling** | ~5–10k rows | **millions** (page fetch is O(pageSize); count is the only scale-sensitive piece, mitigated by `planned`) |

## 6. Reference implementations (this slice)
- **Products** and **Suppliers** converted from client-filter to the standard (server pagination + `<ListSearch>` + `<Pager>`), proving the framework is reusable across entities. `list-query.ts` + unit tests added.

## 7. Rollout & classification
- 🟠 **Should (first hardening sprint):** Customers (removes the M3 cap → S2 per-page redaction), Inventory; conform Invoices/Orders to the helper; **sortable headers** (`<SortableHeader>` + wire), **filtered export**, **mobile Pager polish**, per-entity **count mode**.
- 🟠 **Should:** Returns, Visits, Approval Requests.
- 🟢 **Can-Wait:** Routes paging (small), **saved filters** (`erp_list_views`), row virtualization, per-user column/sort preferences.

## 7a. Operational standard (official, for all current & future list entities)

### Recommended default page sizes
| Tier | Entities | Default | Rationale |
|---|---|--:|---|
| Master data | Customers, Products, Suppliers | **25** | dense rows, frequent scan/edit |
| Transactional | Invoices, Orders, Returns, Approval Requests | **25** | newest-first, status filters |
| High-volume / wide | Inventory levels, Visits, Stock movements | **50** | compact rows, more per screen |
| Small config | Routes, lookups | **50 / none** | usually below one page |
> Override per page; never load unbounded. `pageSize` is a page argument, not hard-coded in the helper.

### Maximum dataset sizes — tested vs designed-for (honest)
- **Tested in CI / dev:** small fixtures (tens–hundreds of rows) for correctness (RLS, pagination math, search). **No large-scale load test has been run yet.**
- **Designed-for (architecture target, per the DB Scalability Review):** 250,000 customers, millions of transactions — supported *because only one page is fetched* and order/filter hit the 0110 composite indexes.
- **Required before claiming the numbers:** the load-testing plan (seed 10 companies × ~25k customers + 12 months of transactions; measure p95 on list/search/sort/paged endpoints with and without `planned` count). **This is a Pilot-Readiness action item, not a completed test.**

### Search behavior — Arabic & English
- Implementation: `ILIKE '%term%'` across configured columns (incl. `name_ar`), OR-combined; input sanitized of `%,(),*`.
- **English:** case-insensitive substring (ILIKE folds ASCII case).
- **Arabic:** matches substrings in `name_ar` (Arabic has no letter case). **Not normalized today:** alef variants (أ/إ/آ/ا), taa-marbuta/haa (ة/ه), and diacritics (tashkeel) are **not** folded — e.g. searching "احمد" won't match "أحمد". 
- **Recommended upgrade (Can-Wait):** a normalized search column (`unaccent` + Arabic letter folding) or `pg_trgm` GIN index for fuzzy/fast matching at scale. Documented for future; current behavior is exact-substring per stored form.

### Sorting on large datasets
- Sort columns are **allow-listed** (`parseSort`) — no arbitrary/ user-supplied column ordering.
- **Sortable columns MUST be indexed** (or part of a composite). Default sorts use indexed columns (`code`, `created_at`) so ordering is an index scan, not a full sort.
- Sorting on **unindexed or computed** columns (e.g. derived balance) at large scale is discouraged — add an index first, or sort within the page only.
- Pagination stays correct under sort because `.order()` + `.range()` are applied together server-side.

### Export — limits & batching
- `exportList` re-applies the **active filters/search/sort** (exports the filtered set, not just the visible page).
- **Batched** via `.range()` in chunks (recommended **1,000 rows/batch**) and streamed to the file — never loads the whole set into memory.
- **Hard cap** recommended at **50,000 rows** per export (beyond that, prompt to narrow filters or use a scheduled/async export). Caps protect the request and the browser.
- Respects RLS + governance redaction (hidden fields excluded from exports).

### Mobile behavior — pagination & filters
- **Pager:** prev/next + "page x/y" + "from–to / total"; large tap targets; hidden entirely when results fit one page.
- **Search:** `<ListSearch>` is full-width on mobile (`w-full`), inline on desktop.
- **Filters:** dropdowns wrap on small screens; recommended enhancement = a **collapsible "Filters" drawer/sheet** on mobile so the toolbar stays clean (Should-Fix polish).
- **List body:** cards on mobile, table on `sm+` (the Customers pattern) — the standard for dense entities.

## 8. Recommended execution order
1. **This slice (done):** framework helper + `<ListSearch>`/`<Pager>` + **Products & Suppliers** references.
2. **Next:** Customers + Inventory (the high-volume ones) → **S2** per-page redaction.
3. **Then:** `<SortableHeader>` + default-sort wiring, filtered export, count-mode per entity, mobile Pager polish.
4. **Then:** Returns/Visits/Approvals rollout.
5. **Later:** saved filters (`erp_list_views`), virtualization.

---

*Design + reference implementation only — no merge, no production migrations.*
