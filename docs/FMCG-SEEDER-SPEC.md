# FMCG Seeder Specification — "FreshLine Distribution"

**Status:** Specification v1 — _awaiting approval before execution_. **No data has been generated.** Disposable test environment only; no production, no production data.
**Purpose:** Define exactly what the Phase 1 Seeder will create so it can be approved before any run. The seeded tenant becomes the durable foundation for UAT, role testing, dashboard/accounting/stock/workflow validation, and performance testing.
**Authorization:** uses the **current production-equivalent** model exactly as reviewed (flat permission keys, role-based scope RLS). Auth P1 (granular catalog) is delivered separately and is **not** required here.
**Currency:** **EGP** (tenant base). No SAR/provider FX involved.

---

## 0. Ground rules (how data is created)

| Category | Method | Why |
|---|---|---|
| **Static masters** — companies, geography, users, customers, products, suppliers, warehouses, routes | **direct insert** (seeded, deterministic) | not "business transactions"; speed + determinism |
| **All stock / financial / approval movement** — opening stock, POs, receipts, stock requests/transfers, invoices, returns, payments, settlements, adjustments, visits | **real write paths** (server actions / `erp_*` RPCs) | exercises numbering, triggers, journals, balances, audit, workflow — the ledger is never hand-forged |

> Phase 0 of execution confirms the exact RPC/action signatures before the first write. Opening inventory is booked as **real purchase receipts** so stock + AP + journals are consistent from t=0.

---

## 1. Companies

| Company | Role | Currency | Notes |
|---|---|---|---|
| **FreshLine Distribution** | primary demo tenant | EGP | all volumes below |
| **RivalCo** | **isolation control** | EGP | small footprint (2 users, ~20 customers, a few invoices) — exists solely to prove **zero cross-tenant leakage** |

All FreshLine data is `SIM-*` namespaced for clean teardown.

---

## 2. Geography & org hierarchy

```
FreshLine Distribution
├── Region: Greater Cairo      (Regional Manager #1)
│     ├── Branch: Cairo Main   ── Warehouse: WH-Cairo
│     └── (Areas: Nasr City, Giza)
├── Region: Delta              (Regional Manager #2)
│     ├── Branch: Tanta        ── Warehouse: WH-Tanta
│     └── (Areas: Mansoura, Mahalla)
└── Region: Upper Egypt        (Regional Manager #3)
      ├── Branch: Assiut       ── Warehouse: WH-Assiut
      └── (Areas: Minya, Sohag)
```

- **3 regions · 6 areas · 3 branches · 3 warehouses** (one warehouse per branch).
- Reps and routes are distributed across the 3 branches (~7/7/6 reps).

---

## 3. Users & roles

Exactly per request, plus one **proposed addition** (flagged) needed to drive warehouse write paths.

| # | Role (current key) | Count | Scope (current RLS) | Purpose |
|---|---|---|---|---|
| 1 | `admin` | **1** | company | tenant owner; settings, oversight |
| 2 | `regional_manager` | **3** | region (1 each) | regional commercial mgmt + approvals (view) |
| 3 | `supervisor` | **2** | own_team | supervise rep teams (~10 reps each) |
| 4 | `salesman` | **20** | own_customers (route) | orders/invoices/collections/visits/stock requests |
| 5 | `accountant` (Finance) | **2** | company | journals, collections, supplier settlement |
| — | **Total named (per request)** | **28** | | |
| 6 | `warehouse_keeper` *(proposed)* | **3** | branch/warehouse | receive stock, approve loading, transfers — **required to run warehouse write paths**; 1 per warehouse |

**Org wiring:** each rep has `reports_to` a supervisor; supervisors/branches sit under a region; `erp_user_branches` populated so scope RLS (`0104/0105`) resolves correctly. The 2 supervisors cover 2 of the 3 branches; the third branch's reps report directly to a regional manager (flagged for your call in §11).

> **Not included** (per your list): branch managers. Return-approval routing (a `branch_manager`/workflow concern) is **P4-gated** anyway — see §7. If you want returns *approved* in this run, we add branch managers; otherwise return **effects** are validated and approval routing is deferred.

---

## 4. Customers — 1,000

Direct-insert masters, fully scoped so visibility/leakage tests are meaningful.

| Attribute | Distribution |
|---|---|
| Count | **1,000** (FreshLine) + ~20 (RivalCo control) |
| Assignment | spread across 3 regions / 3 branches / ~30 routes / 20 reps (~50 customers per route) |
| Scope fields | `region_id`, `area_id`, `branch_id`, `salesman_id`, `route_id` all set |
| Outlet types | traditional retail (~60%), wholesalers (~15%), supermarkets (~15%), pharmacies (~10%) — FMCG channel mix |
| Commercial | credit limit (EGP, tiered by type), payment terms, price tier |
| Status | mostly active; a slice `pending`/`suspended` to exercise status + approval gates |

Opening AR starts at zero; balances arise **only** from real invoices/payments/returns.

---

## 5. Products — ~300 SKUs

Direct-insert masters across FMCG categories.

| Attribute | Distribution |
|---|---|
| Count | **~300** active SKUs |
| Categories | Beverages, Dairy & Chilled, Snacks & Confectionery, Household, Personal Care, Staples/Grocery |
| Per SKU | code/barcode, pack/unit config, cost + sell price (EGP), category, `min_stock`, tax class |
| Shelf-life tag | metadata field (4/15/45/90-day profiles) recorded for **future** near-expiry use — **not active** (no batch/expiry schema yet; near-expiry is a documented gap) |

---

## 6. Suppliers — ~30

Direct-insert masters: ~30 suppliers across the product categories, with payment terms and opening AP at zero (AP arises from real POs/receipts/settlements).

---

## 7. Warehouses & Routes

- **Warehouses: 3** (WH-Cairo, WH-Tanta, WH-Assiut) — one per branch.
- **Routes: ~30** — each rep covers 1–2 routes; routes carry `rep_id` and a customer list (drives Route Coverage KPIs from `erp_visits` + `erp_routes`).

---

## 8. Transaction volumes (all via real write paths)

**Smoke first, then full.** Smoke validates correctness on a subset; full is the 1,000-customer target. A fixed simulated window (e.g. **8 weeks**) gives realistic dating.

| Flow | Real write path (confirmed in Phase 0) | Smoke | Full |
|---|---|---|---|
| Opening stock | purchase **receipt** RPC (≈300 SKUs × 3 WH) | partial | ~900 lines / ~30 POs |
| Purchase orders | PO create → receipt | ~10 | ~40 |
| Stock requests → transfers | `stock_request.create` → approve/load → warehouse→rep transfer | ~40 | ~150 |
| Invoices / orders | sales invoice/order server action (`erp_next_number`, journals) | ~800 | **~5,000** |
| Sales returns (effects) | return create → stock ↑ / AR ↓ / journal | ~80 | ~500 |
| Collections | `erp_record_payment` (+ `idempotency_key`, replayed) | ~500 | ~3,000 |
| Supplier settlements | supplier payment path → AP ↓ | ~10 | ~30 |
| Visits (route coverage) | visit-logging path (productive subset → invoice) | ~2,000 | **~10,000** |
| Stocktake adjustments | `inventory.adjust` path | ~5 | ~20 |

**Gated / deferred in this run:**
- **Approval routing** for over-limit **discounts / returns / writeoffs** is **P4-gated** (needs authz Phase 4 + workflow triggers/handlers). Built approval flows (customer onboarding, change request, credit-limit) are exercised; the others' *effects* are validated, *routing* deferred.
- **Near-expiry, promotions/trade-spend, tasks/calendar** are documented gaps (no schema) — not generated.

---

## 9. Environment & execution model

| Track | Environment | Use |
|---|---|---|
| **A — Automated** | local Postgres via `TEST_DATABASE_URL` (`withRollback`/`actAs`) | invariants, accounting, scope/leakage, audit, idempotency, per-widget scope, perf micro-bench — **persists nothing** |
| **B — Manual UAT** | **disposable Supabase branch DB** (+ Vercel preview) | dashboards, reports, role login, approvals, accounting/stock review — torn down after |

- **Deterministic:** fixed seed (reproducible RNG), fixed date window, `SIM-*` namespacing.
- **No production:** never points at a production project; all data synthetic.

---

## 10. What this foundation enables (acceptance)
UAT · role/scope testing (the persona matrix) · dashboard validation · **accounting** validation (balanced journals, AR/AP reconcile) · **stock** validation (opening + in − out = balance) · **workflow** validation (built flows now; amount-routing after P4) · **performance** testing (lists/search/heaviest-persona dashboard at full volume).

---

## 11. Open decisions (please confirm before execution)
1. **Warehouse keepers (×3)** — add them (recommended, needed to run receiving/transfer write paths) or route warehouse ops through `admin`?
2. **Third branch's reps** — report to a supervisor (add a 3rd supervisor) or to a regional manager (keep your "2 supervisors")?
3. **Branch managers / return approval** — add branch managers so returns are *approved* in-run, or validate return *effects* only and defer approval routing to P4?
4. **Simulated window** — 8 weeks (default) or another span?
5. **Scale** — confirm smoke-first, then full (1,000 customers / ~5,000 invoices).

---

## 12. Status
**Awaiting approval. No seeding, no branch DB, no transactions have run.** On approval (and answers to §11), execution begins at Phase 0 (write-path confirmation), then Seeder masters → opening stock → transaction generator, smoke before full.
