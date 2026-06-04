# FMCG Seeder Specification — "FreshLine Distribution"

**Status:** Specification **v1.1 — APPROVED; decisions locked (§11); execution authorized in a disposable test environment only.** No production data, no production deployment.
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

## 3. Users & roles  _(decisions locked)_

| # | Role (current key) | Count | Scope (current RLS) | Purpose |
|---|---|---|---|---|
| 1 | `admin` | **1** | company | tenant owner; settings, oversight |
| 2 | `regional_manager` | **3** | region (1 each) | regional commercial mgmt |
| 3 | `branch_manager` | **3** | branch (1 each) | branch ops; **approve sales returns** (decision #3) |
| 4 | `supervisor` | **3** | own_team | supervise rep teams (1 per branch — decision #2) |
| 5 | `salesman` | **20** | own_customers (route) | orders/invoices/collections/visits/stock requests |
| 6 | `accountant` (Finance) | **2** | company | journals, collections, supplier settlement |
| 7 | `warehouse_keeper` | **3** | branch/warehouse | receive stock, approve loading, transfers (1 per warehouse — decision #1) |
| — | **Total** | **35** | | (28 named per request + 3 supervisors→3rd, +3 branch mgrs, +3 warehouse keepers; reps spread ~7/7/6) |

**Org wiring:** each rep has `reports_to` its branch supervisor; each branch has a `branch_manager` and a `supervisor`; branches sit under regions with a `regional_manager`; `erp_user_branches` populated so scope RLS (`0104/0105`) resolves correctly. With **3 supervisors** (one per branch), every rep team reports cleanly within its branch (decision #2).

> **Return approvals (decision #3):** branch managers approve sales returns via the **real returns-approval path**. Phase 0 confirms whether that path is the dedicated returns-approve action (runnable now) or the generic workflow amount-routing (P4-gated); if the latter, the approval *step* is flagged at Phase 0 while return *effects* still post. Over-limit **discount/writeoff** approval routing remains **P4-gated** and out of this run.

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
| Sales returns + **approval** | return create → **branch-manager approve** (decision #3) → stock ↑ / AR ↓ / journal | ~80 | ~500 |
| Collections | `erp_record_payment` (+ `idempotency_key`, replayed) | ~500 | ~3,000 |
| Supplier settlements | supplier payment path → AP ↓ | ~10 | ~30 |
| Visits (route coverage) | visit-logging path (productive subset → invoice) | ~2,000 | **~10,000** |
| Stocktake adjustments | `inventory.adjust` path | ~5 | ~20 |

**Window:** **8 weeks** simulated (decision #4). **Scale:** **Smoke first → Full after smoke passes** (decision #5).

**In scope:** sales-return approvals run with branch managers (decision #3), plus the built approval flows (customer onboarding, change request, credit-limit).
**Gated / deferred:** over-limit **discount / writeoff** approval routing is **P4-gated** (needs authz Phase 4); **near-expiry, promotions/trade-spend, tasks/calendar** are documented gaps (no schema) — not generated.

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

## 11. Decisions — RESOLVED
1. **Warehouse keepers (×3)** — ✅ added (1 per warehouse).
2. **Third branch's reps** — ✅ added a **3rd supervisor** (one supervisor per branch).
3. **Branch managers / return approval** — ✅ added **3 branch managers**; **return approvals run** in the simulation.
4. **Simulated window** — ✅ **8 weeks**.
5. **Scale** — ✅ **Smoke first → Full** after smoke passes.

---

## 12. Status & execution prerequisites
**Approved; decisions locked. No seeding, no branch DB, no transactions have run yet.**

**Execution prerequisite — a disposable database must be provisioned.** The current build container has **no reachable DB** (`TEST_DATABASE_URL` unset; no local Postgres). Both tracks need one:
- **Track A** (automated assertions): a Postgres reachable via `TEST_DATABASE_URL` with migrations applied.
- **Track B** (manual UAT): a **Supabase branch DB** (incurs branch cost on the Supabase org) with migrations applied.

On a provisioned disposable DB, execution proceeds: **Phase 0** (write-path confirmation — in progress) → **masters** (direct insert) → **opening stock** (real receipts) → **transaction generator** (real paths) → **Smoke** validation → **Full**. Nothing runs against production.
