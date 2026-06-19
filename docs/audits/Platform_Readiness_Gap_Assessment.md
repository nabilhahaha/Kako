# Full-Platform Readiness & Gap Assessment

**Branch:** `claude/pilot-ux` · **PR:** #319 · **Date:** 2026-06-19 · **Status:** *Assessment & roadmap only — no implementation.*

Grounded in a codebase sweep (routes under `src/app/(app)/`, tables in `supabase/migrations/`, libs in `src/lib/`). Legend: **✅ Implemented** · **🟡 Partial** · **🟠 Exists-but-not-surfaced** · **⬜ Not Implemented**. Effort is at the *workstream* level (S ≈ days · M ≈ 1–2 wks · L ≈ 3–4+ wks).

---

## 1. Readiness matrix

| # | Area | State | What's there / What's missing | Priority | Business impact | Effort |
|---|------|-------|------------------------------|----------|-----------------|--------|
| 1 | **Sales & Distribution** | ✅ | Orders/invoices/returns/POS/pricing/routes all CRUD + surfaced (`/sales/*`, `/distribution/*`). Gaps: order→invoice automation is manual; pricing is a **DB-only rule engine** (no TS calc service); wholesale tier→customer assignment UI thin | Med | High | M |
| 2 | **Journey Planning** | 🟡 | `erp_journey_plans` + `/sales/journey` + `/field/journey` + Smart-Next engine. Gaps: no plan wizard (inherits from customer salesman+visit_day); **frequency stored but not enforced**; no conflict/overlap detection | **High** | High | M–L |
| 3 | **Coverage Management** | 🟠 | KPI engine + `/distribution/coverage` scorecard + visit outcomes. Gaps: **coverage status is computed, not persisted**; **GPS compliance is backend-only (no approve/reject UI)**; no supervisor reconciliation action | **High** | High | M |
| 4 | **Van Sales** | ✅ | Most mature: `/field/van-sales/*` full daily loop (open→pick→sell/collect/return→outcome→day-close), Smart-Next, credit-block gates, 48 lib files + tests. Gaps: Phase-B "confirm load" not routed; offline sync minimal | Med | High | S–M |
| 5 | **Inventory** | 🟡 | Movements, warehouses, expiry, count, low-stock, costing (FIFO/WACC) all surfaced. Gaps: **no batch-aware transfers; no FIFO depletion on sale; no stock reservation on order; no cycle-count reconciliation** | Med–High | High | L |
| 6 | **Warehouse Operations** | 🟡 | Stock requests + partial approval, transfers, van load manifests; GRN created server-side. Gaps: **no receiving/GRN UI; no 3-way match; no goods-in-transit tracking; no capacity checks; suggested-loads no UI** | Med | Med–High | M–L |
| 7 | **Collections** | ✅ | `/collections` + atomic `erp_settle_collection` (locked, idempotent, oldest-first) + receipts + reversal (SoD). Gaps: **no allocation UI** (can't adjust before settle); no partial/on-account state; GL-posting not visible; no write-off | Med | High | M |
| 8 | **Credit Control** | 🟡 | Credit-limit request + approval (`/distribution/credit-requests`), statement/aging, status-blocking, invoice credit guard, **risk-scoring engine (pure)**. Gaps: **risk engine not surfaced/scheduled; no credit override UI; no SLA escalation; no segment tiers; no allowance UI** | Med–High | High | M |
| 9 | **Approvals** | ✅ | Unified workflow engine + `/approvals` queue + action policies + 80-action catalog + handlers. Gaps: **SLA/escalation (schema ready, no cron/UI); parallel/quorum (schema ready, engine sequential); workflow-builder UI incomplete; no notify integration** | Med | Med–High | M–L |
| 10 | **Governance** | ✅ | **Just completed** (G1–G7 + G6b): 5-level field governance (Hidden/View/Request Change/Edit/Approve), Request-Change lifecycle, structured audit envelope, opt-in baseline, pending visibility | Done | High | — |
| 11 | **Roles & Permissions** | 🟡 | Roles + permission matrix, company overrides, UAO, role overrides, granular capabilities, user/staff assignment. **Gap: no custom-role-creation UI (super-admin RPC only)**; no delegable-allowlist control; no hierarchy visualization | **High** | High | L |
| 12 | **Mobile UX** | 🟡 | Responsive workbenches + drawer, van-sales field cockpit (`variant='field'`). Gaps: **offline/PWA rough; no touch-target sizing; no card-based mobile tables for complex entities; no lazy-load/image opt** | Med | Med–High | M |
| 13 | **Reporting & Analytics** | 🟡 | Platform analytics, retail cockpit, perfect-store, OOS, targets, reports hub, exports, copilot analytics. Gaps: **all static (no real-time); no custom KPI/report builder; limited drill-down; no forecasting; field-insights lib not surfaced** | Med | Med–High | L |

---

## 2. Cross-cutting themes

- **"Exists but not surfaced" is the dominant pattern** — the platform is backend-rich; the highest-ROI work is **surfacing existing engines** (coverage status, credit risk scoring, GPS-compliance approvals, allocation UI) rather than greenfield build. This mirrors the Customer Workbench governance finding.
- **FMCG field-ops loop is ~80% there** — van sales is mature; the missing connective tissue is **journey-plan authoring + persisted coverage + compliance approvals**.
- **Commercial gaps cluster around pricing & credit** — per-customer pricing isn't modelled; the credit risk engine isn't surfaced or scheduled.
- **Two platform capabilities are recorded but unbuilt** — Role Builder (custom roles) and Pricing Governance.

---

## 3. Recommended next workstream

**→ Coverage & Journey-Plan Engine** (closes #2 + #3).

Rationale: highest **operational** leverage for an FMCG distribution platform; it completes the field loop van sales already runs; the **Customer Workbench already reads** visit frequency/coverage (G-review), so this makes that data first-class; and most of it is **surface-existing-engines** (coverage KPI service + journey-plan tables + GPS compliance data already exist). Scope: persisted coverage status, journey-plan authoring/wizard + frequency enforcement, conflict detection, and the **GPS-compliance approve/reject UI** (data already logged).

---

## 4. Proposed roadmap sequence

| Seq | Workstream | Why here | Effort |
|-----|-----------|----------|--------|
| **1** | **Coverage & Journey-Plan Engine** | FMCG-core; surfaces data the workbench already reads; persists coverage + compliance approvals | M–L |
| **2** | **Pricing Governance** | Model per-customer price list + resolution hierarchy; unblocks pricing display/assignment (prereq flagged in governance review) | L |
| **3** | **Credit Control surfacing** | Surface the existing pure risk engine (auto-scoring, segment tiers, collections-driven review) + credit-override UI; high reuse | M |
| **4** | **Role Builder & Permission Studio** | UI custom-role lifecycle on the governance model (recorded roadmap item); closes the #11 gap | L |
| **5** | **Approvals hardening** | SLA/escalation (pg_cron), parallel/quorum execution, workflow-builder completion, notifications | M–L |
| **6** | **Inventory & Warehouse depth** | Batch/FIFO depletion, stock reservation, receiving/GRN UI + 3-way match, in-transit tracking | L |
| **7** | **Collections UX + Reporting/Analytics + Mobile/Offline** | Allocation UI + on-account; real-time/drill-down/report-builder; robust offline queue + mobile tables — cross-cutting, run in parallel as capacity allows | M each |

Each workstream runs the established gated methodology (audit → architecture → before/after → reuse → plan → approval → small validated commits → review). Deferred items already recorded: G8 Structured Address, Request-level attachments, Customer Planning & Targeting.

---

**No implementation performed. Awaiting your selection of the next workstream (recommended: Coverage & Journey-Plan Engine).**
