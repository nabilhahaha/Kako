# FMCG Van-Sales Pilot — Runbook & Go/No-Go

The operational guide to stand up and validate a **real distributor pilot** on
the VANTORA FMCG loop: **Visit → Sell → Invoice → Collect → Return → Reconcile**.
Everything ships behind `KAKO_VAN_SALES` (default **OFF**) + the per-company
toggle, so nothing is live until you complete the activation checklist below.

> **Executable companion:** `src/test/integration/van-fmcg-e2e.test.ts` walks this
> exact loop on the real RPCs. If that suite is green against a properly-seeded
> company, the operational flow works end to end. Scope: **online-first**, one
> distributor, one branch, 1–3 van reps. Out of scope: promotions, merchandising
> audits, multi-branch, offline (Phase 6), collections GL posting (Phase 7).

---

## 1. Required users & roles

| Role | Who | Why |
|---|---|---|
| **Platform Owner** | Vendor | Activates the tenant (flag + entitlement); not a daily user. |
| **Company Admin** | Pilot company | Configures master data, users, policy. |
| **Warehouse Keeper** | Pilot company | Approves stock requests, loads the van. |
| **Supervisor** | Pilot company | Approves load adjustments / variance, reviews GPS exceptions. |
| **Salesman (van)** ×1–3 | Pilot company | Runs the route: visit, sell, collect, return, reconcile. |
| **Accountant** *(optional)* | Pilot company | Watches AR / customer balances. |

## 2. Required permissions

| Permission | Granted to | Used for |
|---|---|---|
| `field.sales` | Salesman | Sell, return, **and collect** from the van (the field surfaces gate on it). |
| `sales.discount` | Salesman *(only if discounts allowed)* | Apply a line discount (still capped by company policy). |
| stock-request / load perms | Salesman + Warehouse Keeper | Raise/approve the load. |
| approval perms (workflow) | Supervisor | Load-adjust + variance review. |
| `reports.view` | Supervisor / Accountant | Day reports. |
| `reconciliation.manage` | Salesman / Supervisor | Day-end van reconciliation screen. |

## 3. Required master data (the setup checklists)

### 3.1 Activation checklist (Platform Owner)
- [ ] Set `KAKO_VAN_SALES=1` for the pilot environment.
- [ ] (If `KAKO_ENTITLEMENTS` is ON) enable the `van_sales` module entitlement for the company.
- [ ] Confirm `KAKO_MOBILE` stays **OFF** for an online-first pilot (offline = Phase 6).

### 3.2 Company setup (Company Admin)
- [ ] Company exists with `currency`, `country` (for tax), and a clear name.
- [ ] **Van-sales policy** row (`erp_van_sales_settings`): `is_enabled = true`;
      set `discount_cap_pct` (null = uncapped), `allow_negative_van_stock`
      (recommend **false**), `require_physical_count_on_close` (recommend **true**).

### 3.3 Branch / warehouse setup
- [ ] One **branch** with a `code` (drives document numbers, e.g. `INV-HQ-000001`).
- [ ] A source (non-van) warehouse holding sellable stock.

### 3.4 Van setup (per rep)
- [ ] One **van warehouse** per rep: `is_van = true`, `assigned_to = <rep user id>`,
      `is_active = true`, in the branch. *(The sell/return RPCs require the rep's
      own van — there is no branch fallback.)*
- [ ] Opening stock loaded to the van (via the request → approve → load flow, or
      seeded `erp_inventory_stock`).

### 3.5 Product setup
- [ ] Active products with `sell_price` and `tax_rate` (e.g. 14 for 14% VAT).
- [ ] Units of measure configured where products sell in multiple UoM.

### 3.6 Customer setup
- [ ] Customers `is_approved = true`, on the pilot `branch_id`.
- [ ] `salesman_id` = the rep (keeps GPS check-ins in-route).
- [ ] `credit_limit` set where credit selling applies (0 = unlimited).
- [ ] `latitude`/`longitude` + (optional) a route/journey plan for clean GPS
      compliance. *(Without a plan, check-in still succeeds but flags
      `out_of_route` — a config note, not a failure.)*

### 3.7 Pricing setup
- [ ] One clear **price list** and a small **rule set** (`erp_price_rules`) — the
      van-sell + collection paths resolve price **server-side** via
      `erp_resolve_price`; the rep never types a price.
- [ ] Validate resolution order with 2–3 real SKUs before go-live.

### 3.8 Collections setup
- [ ] No extra schema — collections reuse `erp_collections` /
      `erp_collection_allocations`; numbers come from `erp_next_number('collection')`
      (`COL-<branch>-NNNNNN`).
- [ ] Decide the default: **auto oldest-first** (recommended) vs per-invoice.

### 3.9 Return reasons
- [ ] Per-company `erp_return_reasons` seeded + active (a reason is **mandatory**
      on every van return). Defaults seed automatically for existing companies.

---

## 4. End-to-end validation scenarios

Run the executable suite (`van-fmcg-e2e.test.ts`) **and** a supervised manual
dry-run on the pilot device. Each scenario below maps to a passing test.

| # | Scenario | Expected outcome |
|---|---|---|
| 1 | **Full loop** (visit → sell → collect → return → reconcile) | Visit logged · invoice issued · van stock ↓ · AR ↑ · partial collection applied · return restocks van + credit note · **van on-hand = loaded − sold + returned** |
| 2 | **Normal sale** | Invoice issued at server price; van stock decremented; AR raised. |
| 3 | **Sale with discount** (within cap) | Net reflects the discount; over-cap is rejected. |
| 4 | **Partial then full collection** | Invoice `partially_paid` → `paid`; balance → 0. |
| 5 | **Multi-invoice collection** (oldest-first) | One receipt clears the oldest invoice and part of the next; balance correct. |
| 6 | **Return with credit note** | Stock returns to the **van**; `CN-<return_number>` issued and linked; balance credited. |
| 7 | **Stock reconciliation** | Live van stock equals loaded − sold + returned; movement ledger consistent. |
| 8 | **Failed validations** | Over-credit · discount-over-cap · missing return reason · **no assigned van** all rejected. |

---

## 5. Go / No-Go checklist (pilot launch)

**Must be TRUE to launch:**
- [ ] `KAKO_VAN_SALES` ON for the pilot env; `erp_van_sales_settings.is_enabled = true`.
- [ ] Each rep has an **assigned, stocked van warehouse**.
- [ ] Products priced (`sell_price` + `tax_rate`); one validated price list/rule set.
- [ ] Customers approved, on-branch, with credit limits where needed.
- [ ] Return reasons active; van-sales discount/negative-stock policy set.
- [ ] Rep permissions granted (`field.sales`, optionally `sales.discount`).
- [ ] **E2E suite green** against the pilot company's shape.
- [ ] **One supervised manual dry-run** of the full loop on the actual device.
- [ ] Pilot route has **adequate connectivity** (online-first; see blockers).
- [ ] Tax configuration matches the jurisdiction (e-invoice clearance is async).

**Launch only when every box is checked.** Roll back instantly by unsetting
`KAKO_VAN_SALES` (or `erp_van_sales_settings.is_enabled = false`) — all surfaces
go inert; no data is lost.

---

## 6. Remaining blockers to a real distributor pilot

**Hard (do before pilot):**
1. **Tenant activation** — flag + per-company toggle (owner-approved; not done by default).
2. **Master-data + user + permission seeding** per the checklists above.
3. **One supervised E2E dry-run** on the real device to validate configuration.

**Conditional (depends on the pilot territory):**
4. **Offline (Phase 6)** — the loop is **online-first**; pricing and commit need a
   connection. If reps work where connectivity drops, sequence Phase 6 first.
   *Mitigation: pick a well-connected pilot route.*

**Soft (can follow during the pilot — explicitly on hold):**
5. Collections **GL posting** (Phase 7, `KAKO_FINANCE`).
6. Day-end **sold/returned reconciliation glue** (Phase 8 reporting; variance vs
   live stock already works — see scenario 7).
7. **Bluetooth receipt printing** (PDF/share works today).
8. Promotions, merchandising audits, brands master (out of pilot scope).

---

## 7. Recommendation

**Conditional GO** for a controlled, **online-first** pilot on a well-connected
route, once Sections 1–3 are complete and the Section 4 validation (automated +
one manual dry-run) passes. **No-Go only** if the territory has poor connectivity
*and* offline is mandatory — in that case build **Phase 6** first.
