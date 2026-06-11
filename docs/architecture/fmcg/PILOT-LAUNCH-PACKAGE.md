# VANTORA — FMCG Pilot Launch Package

The single operational package to run the first real FMCG distributor pilot.
Consolidates every discovery and artifact from the engineering + validation
phases. Ships with the software (PR #311). Companion docs:
`PILOT-RUNBOOK.md` (detailed), `SELL-INVOICE-COLLECT-DESIGN.md` (engineering),
and the executable rehearsals under `src/test/integration/`.

> **Scope:** one distributor, one branch, 1–3 van reps, **online-first**, behind
> `KAKO_VAN_SALES` (default OFF) + a per-company toggle. No production data is
> touched until you activate. **No new platform features** — operational only.

---

## 0. What was validated (discoveries folded in)

| Source | Outcome |
|---|---|
| **Readiness diagnostic** (`/field/van-sales/readiness`) | Auto-runs the Go/No-Go controls (van active, vans assigned+stocked, every SKU positively priced, single base UoM, approved customers, return reasons, sane policy). Pure core unit-tested. |
| **Simulation** (~1,000 randomized txns) | **Zero** invariant violations — stock conservation, AR consistency, allocation integrity, no negative stock, unique numbering, idempotency, tenant isolation. ~270 sales/s. |
| **Supervised dry-run** (full operator day) | Every step + every validation green. |
| **Role reconciliation finding** | The reconciliation **RPC** enforces via the DB (`erp_role_permissions`), not the TS layer. App perms were **aligned to the DB authority**: rep → `reconciliation.view`; supervisor + warehouse-keeper → `view + manage`. Reconciliation is run by the supervisor/warehouse-keeper. |
| **Navigation hardening** | Flag-aware nav: Alerts, Change Requests, Van Sales Settings appear when their flag is ON and disappear cleanly when OFF — no URL-only orphans; the Van Sales hub is surfaced on `/today`. |
| **Printing improvements** | Company **logo + branding** on every FMCG document; new **credit-note** and **collection-receipt** documents; **Print/Share/Continue** (never auto-print) on sell/collect/return. |

**Re-verified at package time:** typecheck clean · 1280 unit · 176 integration
(incl. dry-run + ~1,000-txn simulation) · build green.

---

## 1. Demo-distributor seed package

`supabase/pilot/demo-distributor.sql` — idempotent, one-transaction provisioning
for a **dedicated demo/staging** project (validated: runs clean). Creates:

- **Nile FMCG Distribution Co.** (EGP/EG) + Van-Sales policy (cap 15%, no negative stock)
- **Cairo** branch + **Main Warehouse** + one **rep van** (assigned)
- **4 pilot users**: admin · supervisor · warehouse-keeper · salesman
- **10 SKUs** (priced; SKU-0 14% VAT) loaded 240 each on the van
- **20 approved customers** (credit limit 5,000 + GPS, assigned to the rep)
- **4 return reasons** + a customer promo (server-side pricing demo)

Executable twin: `src/test/integration/pilot-dry-run.test.ts` runs the same shape
and the full day on the real RPCs — green = the tenant will behave identically.

---

## 2. One-click pilot setup checklist

Run top to bottom; stop at the first ✗.

- [ ] **Environment** — dedicated demo/staging Supabase; `KAKO_VAN_SALES=1`.
- [ ] **Provision** — run `supabase/pilot/demo-distributor.sql` (or your real
      master data). For a production pilot, instead **invite the 4 users** via
      Settings → Users with roles admin/supervisor/warehouse-keeper/salesman.
- [ ] **Per-company toggle** — `erp_van_sales_settings.is_enabled = true`; set
      `discount_cap_pct`, `allow_negative_van_stock = false`.
- [ ] **Van** — `is_van=true`, `assigned_to=<rep>`, active; **opening stock loaded**.
- [ ] **Products** — every pilot SKU `sell_price > 0` + `tax_rate`; **one base UoM**.
- [ ] **Pricing** — one clear price list/rule; validate 2–3 SKUs resolve a positive price.
- [ ] **Customers** — approved, on-branch, `salesman_id`=rep, credit limits, GPS.
- [ ] **Return reasons** — at least one active.
- [ ] **Tax** — configured for the jurisdiction (e-invoice clearance is async).
- [ ] **Readiness Diagnostic** — open `/field/van-sales/readiness` as admin →
      **READY, 0 blockers**.
- [ ] **Supervised dry-run** (Section 4) on the real device → all green.

---

## 3. Final Go / No-Go checklist

**GO only when all are TRUE:**
- [ ] `KAKO_VAN_SALES` ON + per-company `is_enabled = true`.
- [ ] Each rep has an **assigned, stocked van**.
- [ ] **Every SKU resolves to a positive price** (PRICE control).
- [ ] **One base UoM per SKU**; **van stock unit = sales unit** (UoM-1/UoM-2).
- [ ] Customers approved/on-branch with credit limits; return reasons active.
- [ ] Roles assigned (admin/supervisor/warehouse-keeper/salesman); reconciliation
      is run by supervisor/warehouse-keeper.
- [ ] **Readiness Diagnostic = READY**; **one supervised dry-run passed** on device.
- [ ] Pilot route has **adequate connectivity** (online-first).

**NO-GO** only if the route has poor connectivity **and** offline is mandatory →
sequence Phase 6 (offline) first.

---

## 4. Pilot Day-1 Operations Guide

The rep's day on the device (each step prints/shares; **never auto-prints**):

| # | Action | Where | Expected |
|---|---|---|---|
| 1 | **Open day** | My Day (`/field/van-sales`, or `/today` → Van Sales) | Day shows *open* |
| 2 | **Confirm van load** | Confirm Load | Accepted qty posts to van stock |
| 3 | **Visit** customer | Journey → check in | Visit logged (GPS status) |
| 4 | **Sell** | Sell → add items → review → issue | Invoice `INV-…`; van stock ↓; AR ↑ |
| 5 | **Invoice doc** | "Transaction completed" → **Print / Share / Continue** | Branded invoice |
| 6 | **Collect** | Collect → amount (auto oldest-first) → settle | `COL-…`; invoice paid/partial |
| 7 | **Receipt doc** | → **Print / Share / Continue** | Branded collection receipt |
| 8 | **Return** | Return → items + **reason** → (credit note) | `RET-…`; stock back to van |
| 9 | **Credit note doc** | tap the issued credit note | Branded `CN-RET-…` |
| 10 | **Reconcile** | **supervisor / warehouse-keeper** runs day-end reconcile | Variance within tolerance |
| 11 | **Close day** | End Day | Day closed; reports updated |

Day-1 supervisor watch-items: every sale/collection/return goes **through the
app** (no off-book), reasons captured on returns, day reconciled and closed.

---

## 5. Pilot Week-1 Monitoring Guide

Review daily; escalate on any red.

| Metric | Target | Where / how |
|---|---|---|
| Stock accuracy | ≥ 99% (van = loaded − sold + returned) | Day-end reconciliation variance |
| AR / balance accuracy | 100% consistent | Customer statement vs invoices − collections − credits |
| In-app sales | ≥ 95% of route sales | Invoices vs reported sales |
| Collection rate | route target (e.g. ≥ 90% of due) | Collections vs outstanding (aging) |
| Returns via system | 100% with a reason | Returns count + reason completeness |
| Day-close compliance | 100% closed + reconciled | Closed sessions / day |
| Error/void rate | < 5% | Cancelled/corrected docs |
| Cross-tenant incidents | 0 | Audit log review |
| Adoption | all reps daily | Active reps / day |

Weekly: confirm numbering is sequential per branch; spot-check 3–5 customer
balances against statements; review GPS out-of-route exceptions.

---

## 6. Pilot Failure Recovery Guide

Issues are **non-destructive and recoverable** — the loop is atomic + idempotent.

| Symptom | Likely cause | Recovery |
|---|---|---|
| "No van assigned" on sell/return | van missing `is_van`/`assigned_to` | Assign the rep's van; retry. |
| Sell rejected `over_credit` | balance + net > credit limit | Collect first, or raise the limit (credit workflow). |
| Sell rejected `insufficient_van_stock` | overselling the van | Load stock, or sell available qty. |
| Sale resolves price 0 | SKU `sell_price ≤ 0` / no rule | Fix the SKU price; the Readiness Diagnostic flags this pre-launch. |
| Reconciliation "not authorized" | run by the rep | Run it as the **supervisor/warehouse-keeper**. |
| Duplicate tap / flaky network | retry | **Idempotency key** ⇒ no double sale/collection/return; the repeat returns the same document. |
| Connectivity drop mid-day | online-first | Cart is kept; pricing/issue resume on reconnect (offline queue = Phase 6). |
| Wrong reason / amount on a posted doc | data entry | Use a **return + credit note** (sale) or a corrective collection; never edit balances by hand. |

Escalation: capture the document number + error token, check the audit log
(`erp_audit_logs`), and reconcile in the app — do **not** mutate balances/stock
directly.

---

## 7. Pilot Rollback Guide

**Instant, non-destructive — no data loss.**

1. **Pause the whole module:** unset `KAKO_VAN_SALES` (env) **or** set
   `erp_van_sales_settings.is_enabled = false` → all van-sales surfaces (sell,
   collect, return, readiness, hub link, nav entries) go **inert/hidden**; nothing
   is deleted; issued invoices/collections/returns remain valid.
2. **Per-rep pause:** unassign the rep's van (`assigned_to = null`) → that rep can
   no longer sell from the van; existing data untouched.
3. **Demo teardown** (demo/staging only): delete the demo company — cascades
   remove its branches/warehouses/customers/products. **Never** on production.
4. **Re-enable:** set the flag/toggle back on; the module resumes exactly as before.

There is **no migration to revert** for a pause — the rollback is configuration,
not schema. (Each FMCG migration documents a manual `DROP` rollback if ever needed.)

---

## 8. Verification matrix (this package)

| Area | Status | Evidence |
|---|---|---|
| Activation flow | ✅ | settings/flag gating · e2e |
| Permissions | ✅ | 577 erp tests · reconciliation aligned to DB · dry-run |
| Navigation | ✅ | flag-aware nav tests |
| Printing | ✅ | branded invoice/receipt/return/credit-note/collection (build-validated) |
| Reconciliation | ✅ | dry-run variance 0 (run by warehouse-keeper) |
| Collections | ✅ | collection-settle · simulation · dry-run |
| Returns | ✅ | van-return · dry-run (credit-note linkage) |
| Pricing | ✅ | server-resolved price · promo in dry-run |
| Customer balances | ✅ | AR consistency (simulation + dry-run) |
| Stock balances | ✅ | stock conservation (simulation + dry-run) |

---

## 9. Final readiness

**FMCG transactional core 95/100 · overall pilot 88/100** — the remaining gap is
operational (activation + setup + supervised dry-run + the connectivity decision),
not engineering.

**Recommendation: GO** for a controlled, online-first FMCG distributor pilot once
Sections 2–4 pass. Rollback is one switch.
