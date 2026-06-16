# FMCG Pilot Readiness Audit

**Project:** Kako Van-Sales — FMCG distributor pilot
**Branch:** `claude/fmcg-sell-collect-loop` · **PR #311**
**Scope:** sell → invoice → collect → return → reconcile → day-close; route / visit cockpit; visit outcomes; credit control; governance.
**Status at audit:** build green · 1,448 unit tests pass · feature development frozen (analysis + gap-closure only).

This report covers the six requested deliverables — Feature Inventory, UI Coverage Audit, Role Coverage Audit, Permission Audit, Mobile Audit, Gap Report — followed by the closure of the one blocker-for-enforcement gap (G1).

---

## 1. Feature Inventory

### 1.1 Transactional spine (fully implemented)

Each core operation is an atomic `SECURITY DEFINER` RPC.

| Capability | RPC | Migration |
| --- | --- | --- |
| Van sale | `erp_van_sell` (+ `_uom`, `_with_payment`) | 0265 / 0305 / 0306 |
| Return | `erp_van_return` | 0266 |
| Collection (multi-invoice) | `erp_settle_collection` / `erp_reverse_collection` | 0267 / 0273 |
| Day close (+ approve) | `erp_close_day` / `erp_approve_day_close` | 0132 |
| Van reconciliation | `erp_compute / settle / reject_van_reconciliation` | 0138 |
| Day reopen (governed) | `erp_request / decide_day_reopen` | 0308 |
| Cash handover (governed) | `erp_request / decide_cash_handover` | 0309 |
| Load confirm | `erp_van_confirm_load` | 0247 |

### 1.2 Feature flags (all platform-pack, default OFF, reversible)

`collect_in_sell`, `visit_driven_route`, `smart_next_customer`, `day_reopen`, `unified_salesman_workspace`, `salesman_requests`, `credit_override`, `action_authz_enforcement`, `rpc_authz_enforcement`.

### 1.3 Pure logic + tests

`src/lib/van-sales/` carries **113 van-sales unit tests** across 11 files (sell 32, next-customer 14, visit-outcome 14, visit-recommendation 10, load 10, pilot-readiness 12, returns 5, reports 4, plus day/session/offline). Helpers `map-links.ts`, `active-visit.ts`, `visit-metrics.ts` are untested (low-risk).

### 1.4 Data model (key tables)

`erp_invoices`, `erp_collections (+allocations)`, `erp_van_load_manifests`, `erp_van_reconciliations`, `erp_visits`, `erp_visit_outcomes` (new), `erp_routes`, `erp_journey_plans`, `erp_customer_credit_profiles (+block_rules)`, `erp_credit_notes`, `erp_cash_handover_requests`, `erp_work_sessions`.

**Signal:** functionally complete and well-tested; caveats are *gating* (dark by default), not *engine* gaps.

---

## 2. UI Coverage Audit

Every pilot capability maps to a screen.

| Capability | Screen | Facing |
| --- | --- | --- |
| Start Day / session | `/today`, `/field/van-sales` | mobile |
| My Day hub | `/today` (`salesman-workspace`) | mobile |
| Route / Journey | `/field/route`, `/field/journey` | mobile |
| Visit Cockpit | `/field/van-sales/statement/[id]` (field variant) | mobile |
| New Sale | `/field/van-sales/sell` | mobile |
| Collection | `/field/van-sales/collect` (+ collect-in-sell) | mobile |
| Return | `/field/van-sales/return` | mobile |
| Visit Outcome / No Sale | cockpit sheet → `erp_visit_outcomes` | mobile |
| Smart Next | `/field/next` | mobile |
| Load / Stock Request | `/field/van-sales/request(s)` | mobile |
| Cash Handover | `/field/van-sales/cash-handovers` | mobile |
| Day Close / Reconcile | `/field/van-reconciliation`, `/field/van-sales/confirm` | mobile / supervisor |
| Approvals | `/approvals/queue`, `/field/van-sales/{reopen-approvals, customer-requests}` | supervisor |
| Visit Outcomes report | `/distribution/visit-outcomes` (added this engagement) | supervisor |
| Rep performance | `/distribution/report` | manager |
| Pilot Readiness Diagnostic | `/field/van-sales/readiness` | admin |

**Navigation:** salesman screens are reached via the `/today` hub + `/field/van-sales` index (mobile-by-design, not the global sidebar); supervisor / manager reports are registered in `navigation.ts` with `reports.view` / `reconciliation.*` gates.
**Minor orphans / dupes (non-blocking):** `/field/van-sales/reports` vs `requests` vs `request`; `/distribution/perfect-store` vs `perfect-store-scores`.
**i18n:** field screens use `t()` (ar/en) consistently; parity tests pass.
**States:** cockpit / sell / collect / return / today all have empty + loading affordances (`PendingLink`, `loading` buttons).

**Signal:** UI coverage complete; the only prior gap (visit-outcome surfacing) is now closed.

---

## 3. Role Coverage Audit

| Role | Pilot capabilities |
| --- | --- |
| salesman (rep) | sell, collect, field.sales, day.close, day.reopen.request, cash.handover.request, customer.request, stock_request.create, stock.transfer, reconciliation.view |
| supervisor | + discount, return, change_status, reports.view, approve out-of-route, day-close exception, reconciliation.manage, day.reopen.approve, cash.handover.confirm, customer.request.approve, stock_request.approve |
| warehouse_keeper | inventory / stock adjust + transfer, stock_request.approve, reconciliation.manage |
| accountant | accounting.post, collect, cash.handover.confirm, change_status, reports.view |
| branch / area / regional / director | escalating commercial + approval sets |
| admin / manager | ALL · super admin / platform owner = apex (everything) |

Separation of duties is correct: rep **requests / creates**, supervisor / warehouse **approve**, accountant handles cash / collect. No role lacks a permission it operationally needs.

---

## 4. Permission Audit

- **Catalog:** every pilot action has a dedicated permission (`field.sales`, `sales.*`, `reconciliation.*`, `visit.approve_out_of_route`, `day.*`, `cash.handover.*`, `customer.request*`, `stock_request.*`).
- **Always-on enforcement:** governance / workflow actions in `field/actions.ts` (close day, approve day-close, visit compliance, transfers) check `hasPermission` **unconditionally**.
- **Admin Credit Override** is correctly **double-gated**: `creditOverrideEnabled(flags) && (hasPermission(ctx,'customers.change_status') || isSuperAdmin)` (`statement/[id]/page.tsx`).
- **Core money path (pre-G1 finding):** `sell-server.ts` / `collect-server.ts` / `returns-server.ts` enforced only `requireAuth` + enablement; server-side permission depended on the **default-OFF** `erp_guard_rpc` (`platform.rpc_authz_enforcement`). **Closed by G1 — see §7.**

---

## 5. Mobile Audit

- **Responsiveness — STRONG:** mobile-first throughout — sticky action bars (`fixed inset-x-0 bottom-nav-safe`), bottom-sheets with `env(safe-area-inset-bottom)`, `grid-cols-2/3` tiles, mobile-cards-vs-`sm:`-tables, `viewportFit:'cover'`.
- **Touch — STRONG:** shared `Button` (`active:scale-[0.97]`, `touch-manipulation`, `loading`) + `PendingLink` (spinner + double-tap guard) used across field screens.
- **RTL / Arabic — STRONG:** 18 field files use `rtl:` / `dir`, icons flip, numerics forced LTR, `name_ar` locale-resolved.
- **Visit ergonomics — STRONG:** cockpit → action → Resume Visit (`active-visit` localStorage) → Next Customer → route progress.
- **Offline — PARTIAL:** real service worker (`public/sw.js`) + `manifest.webmanifest` + `/field/offline`, and an offline-sync engine exist, but are gated by `KAKO_MOBILE` (default OFF), and **sell / collect / return do not enqueue offline** (sell blocks with a toast; collect / return assume connectivity). Borderline-small tap targets on budget phones.

**Signal:** AMBER — excellent responsive / touch / RTL UX and resume flow, but connectivity-dependent core transactions make it pilot-viable **online-first**.

---

## 6. Gap Report (prioritized)

| # | Severity | Gap | Recommendation | Status |
| --- | --- | --- | --- | --- |
| G1 | Blocker-for-enforcement | Core transaction actions (sell / collect / return) had no always-on permission gate; relied on RLS + default-OFF RPC guard | Add unconditional action-layer permission gate mirroring the RPC guards | **CLOSED (§7)** |
| G2 | High | No offline sell / collect / return | Pilot is online-first (decision taken); offline sync deferred | Accepted — online-first |
| G3 | High | `decideCustomerRequest` + reconciliation compute/settle enforce permission only in RPC / page, not JS action layer | Verify RPC self-checks; add JS `hasPermission` for consistency | Backlog |
| G4 | Medium | `addVanExpense` gated on `reports.view` (read perm gating a write) | Re-gate to `reconciliation.manage` / accounting perm | Backlog |
| G5 | Low | Nav orphans / dupes | Consolidate / remove dead routes | Backlog |
| G6 | Info | All pilot flags default OFF | Pre-pilot per-tenant flag-enablement checklist | Activation step |
| G7 | Closed | Visit outcomes not surfaced in a report | Built `/distribution/visit-outcomes` | DONE |

### Readiness verdict

**Engine: pilot-ready.** Transactional core complete, atomic, RLS-scoped, tested, build green; roles / permissions comprehensive with correct separation of duties; UI coverage complete; mobile UX strong.

**Gate to "go" is activation + one enforcement decision, not engineering:** enable `rpc_authz_enforcement` (now backstopped by G1), online-first connectivity (G2 accepted), and confirm the two RPC self-checks (G3).

**Overall: GO for a controlled, online-first pilot.**

---

## 7. G1 Closure — Always-On Money-Path Permission Enforcement

**Change:** added `requireActionPermission(perm)` in `src/lib/erp/guards.ts` — an **unconditional** (non-flag-gated) action-layer gate, distinct from the flag-gated `requireActionPerm` no-op. Applied to the four money-path mutations, mirroring the RPC guards exactly.

| Action | File | Always-on gate | RPC guard (0314) | Match |
| --- | --- | --- | --- | --- |
| `vanSell` | `sell-server.ts` | `field.sales` | `field.sales` | yes |
| `vanSellWithPayment` | `sell-server.ts` | `field.sales` | `field.sales` | yes |
| `settleCollectionEntry` | `collect-server.ts` | `sales.collect` | `sales.collect` | yes |
| `vanReturn` | `returns-server.ts` | `field.sales` | `field.sales` | yes |

Enforcement now holds **with flags OFF**: page-hidden + always-on action permission + RLS + (optional) RPC guard — defense in depth.

### Re-audit — Permission

Every money-path mutation calls `requireActionPermission` unconditionally (verified). `hasPermission` grants apex automatically. Governance always-on gates and the double-gated Admin Credit Override are unchanged.

### Re-audit — Role (reachability of gated actions)

| Role | field.sales | sales.collect | Sell | Collect | Return |
| --- | --- | --- | --- | --- | --- |
| salesman | yes | yes | yes | yes | yes |
| driver | yes | yes | yes | yes | yes |
| admin / manager / apex | yes | yes | yes | yes | yes |
| supervisor / accountant / warehouse | no field.sales | — | already blocked at page | — | — |

No role holds `field.sales` without `sales.collect`, so the collect gate excludes no field rep.

### Regression confirmation

- **Callers:** `sell-screen`, `collect-screen`, `return-screen` — all behind pages already gating `field.sales`; every valid caller retains access.
- **Tests:** 1,448 pass (4 new guards tests: unauth / has-perm / lacks-perm / apex).
- **Typecheck:** clean (no import cycle — `permissions.ts` does not import `guards`).
- **Build:** compiled successfully.

**No regression detected. G1 closed.**

---

*Generated from the Kako codebase audit. G2 accepted as online-first; G3–G5 remain in backlog; Role Builder not started; no new features introduced beyond the Visit Outcomes report and the G1 security fix.*
