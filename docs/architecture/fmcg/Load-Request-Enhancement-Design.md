# Load Request Enhancement — Design & Backlog

**Status:** DESIGN ONLY — not implemented (respects the current "pilot-polish-only / no new features" freeze). A new feature with schema needs; queued for when the freeze lifts.
**Goal:** make the van load request inventory-aware (van vs pending vs warehouse stock), let supervisors edit/partially approve, and store requested-vs-approved through a clear status flow.

---

## 1. What exists today
- Load/stock request flow: `stock_request.create` (rep) → `stock_request.approve` (warehouse/supervisor); `erp_van_load_manifests (+lines)`; approval chain (migrations 0248, 0302 `KAKO_APPROVAL_LOADREQ`), van confirm-load posting (0247).
- Van on-hand: `erp_inventory_stock` (van warehouse). Main warehouse stock: `erp_inventory_stock` (main warehouses).

## 2. Inventory awareness (per SKU in the picker)
When selecting a SKU, show:
- **Van Stock** — current van balance (`erp_inventory_stock`, van warehouse).
- **Pending Approved Loads** — approved-but-not-yet-loaded quantity for this SKU (sum of approved load-request lines not yet posted).
- **Warehouse Available Stock** — source warehouse on-hand (**permission-gated**, see §3).
- **Requested Quantity** — what the rep is asking for.

> Example: `Van Stock: 12 · Pending Loads: 50 · Warehouse Stock: 420`

**Show all active warehouse SKUs** in the picker (not only previously-requested items) so reps don't forget items — searchable list of the source warehouse's active products.

## 3. Permissions — warehouse stock visibility
- New capability `stock.warehouse_visibility` (or a per-role setting): **configurable** for salesman + supervisor; **warehouse_keeper always sees it**.
- When OFF for the role, the Warehouse Stock column is hidden (the rest still shows).

## 4. Supervisor / warehouse actions
On review, the approver can: **edit quantities · add SKUs · remove SKUs · approve · reject · partially approve**. Store BOTH numbers per line: `requested_qty` and `approved_qty` (e.g. requested 100 → approved 70). Rejections carry a reason.

## 5. Status flow
```
Draft → Submitted → Supervisor Review → Warehouse Approval → Loaded
                         │                     │
                         └── Reject ───────────┴── Reject (with reason)
```
Each transition is system-stamped (who/when); no self-approval.

## 6. Data model (additive)
- `erp_van_load_request_lines`: `requested_qty`, `approved_qty` (null until decided), `line_status`.
- `erp_van_load_requests`: `status` enum (`draft|submitted|supervisor_review|warehouse_approval|loaded|rejected`), `submitted_by/at`, `supervisor_by/at`, `warehouse_by/at`, `rejection_reason`.
- Permission/setting: `stock.warehouse_visibility` per role (company setting).
- Reuse `erp_van_load_manifests` for the final Loaded posting (0247).

## 7. RPCs / actions
- `erp_submit_load_request` (draft→submitted).
- `erp_decide_load_request` (supervisor + warehouse stages): edit lines, set approved_qty, add/remove SKUs, approve/partial/reject; always-on permission gate (`stock_request.approve` / role); audit; no self-approve.
- On final approval → post the load manifest (existing 0247 path) using `approved_qty`.

## 8. Reporting & audit
Requested vs approved variance per request; pending-load visibility; audit (created/submitted/approved/rejected by + when + reason). Surfaces in supervisor reports.

## 9. Rollout
Flag-gate `platform.load_request_v2` (default OFF); additive migrations (existing requests map to current behavior). Phased: A schema+settings · B inventory-aware picker (van/pending/warehouse + all-SKUs) · C supervisor edit/partial-approve + status flow · D reporting/audit.

---

*Design-only. No code/schema changes. Implementation deferred until the pilot-polish freeze lifts.*
