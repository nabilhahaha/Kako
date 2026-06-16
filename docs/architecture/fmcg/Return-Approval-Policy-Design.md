# Return Approval Policy — Design & Preparation (Separate Phase)

**Status:** DESIGN ONLY — not implemented (per request: design the policy-based workflow first, implement in a separate phase; do not fold into the current bug fix).
**Goal:** make returns configurable per company/role with three policy modes, an approval workflow, approver assignment, reporting, and audit.

---

## 1. Policy modes (per company, overridable per role)

| Mode | Rep can create? | Posting | Inventory / balance |
| --- | --- | --- | --- |
| **Disabled** | No | — | Return tile hidden/disabled; message **"المرتجعات غير مفعلة لهذا الدور"** |
| **Direct** | Yes | Posted immediately on confirm | Updated immediately (current behavior) |
| **Approval** | Yes (creates a **request**) | NOT posted until approved | Unchanged until approval |

Default for pilot: **Direct** (preserves today's behavior). The mode is a company setting; an optional per-role override comes later.

## 2. Approver assignment (admin-configurable)

Admin configures **who approves returns** — one approver or approver role for the pilot:
- Direct Supervisor · Warehouse Keeper · Accountant · Branch Manager · Specific User.
- Pilot: **single approver role OR single named user**. Multiple/又 escalation approvers are a later enhancement.

Backed by a new permission **`returns.approve`** plus a company setting `return_approver_role` / `return_approver_user_id`.

## 3. Workflow

```
Sales Rep → Create Return → Submit for Approval
  → Status: PENDING_APPROVAL  (inventory & balance NOT touched)
  → Approver receives request (approval queue)
  → Approve ──► Post return → update inventory → update balance / credit note → customer history
  → Reject  ──► status REJECTED (reason required) → NO inventory/balance change
```

Direct mode collapses the middle: confirm → post immediately (today's `erp_van_return`).

## 4. Data model

### 4.1 Return status & request fields (`erp_sales_returns`)
- `status` extended: `draft | pending_approval | approved | rejected | posted` (today's posted return = `posted`; direct mode goes straight to `posted`).
- `requested_by`, `requested_at`.
- `approved_by`, `approved_at` · `rejected_by`, `rejected_at`, `rejection_reason`.
- For approval mode the row is created **without** stock/balance effects (header + lines only); posting happens on approval.

### 4.2 Company policy settings
- `return_policy_mode` (`disabled | direct | approval`, default `direct`).
- `return_approver_role` (BranchRole) **or** `return_approver_user_id` (uuid).
- Optional per-role override table (later).

## 5. RPC / server actions

- **Direct mode:** existing `erp_van_return` (posts immediately) — unchanged.
- **Approval mode:**
  - `erp_request_van_return(...)` → inserts header+lines as `pending_approval`, **no** stock movement / no AR change, returns the request id. Mirrors the existing governed request pattern (cf. `erp_request_day_reopen`, customer requests).
  - `erp_decide_van_return(p_return_id, p_decision, p_reason)` → on `approve`: runs the same atomic posting path as `erp_van_return` (stock `return_in`, credit note, AR); on `reject`: sets `rejected` + reason; **no self-approval**; `returns.approve` enforced inline (always-on, like the other governance RPCs). `SECURITY DEFINER`, audited.
- Reuse the **G1** always-on permission pattern: request gated by `field.sales`, decide gated by `returns.approve`.

## 6. UI

**Return screen (mode-aware):**
- Disabled → tile hidden/disabled + message "المرتجعات غير مفعلة لهذا الدور".
- Direct → confirm button **"تأكيد المرتجع"** (posts now).
- Approval → submit button **"إرسال طلب موافقة"** (creates request).

**After submitting an approval request — visit-oriented success:**
- Title: **"تم إرسال طلب المرتجع للموافقة"**
- Primary: **العميل التالي** · Secondary: **إجراء آخر لنفس العميل** (same pattern just shipped).

**Approver — approval queue (`/approvals/queue` + field approvals):** add a Return Approvals entry showing Customer · Salesman · SKU list · Quantity · Return type (saleable/damage, once that lands) · Reason · Amount · **Approve / Reject** (reject requires a reason).

## 7. Reporting & audit

**Reporting:** Pending / Approved / Rejected returns; approval time (requested→decided); approver name; rejection reason. Add to the returns analysis + a returns-approval report; surface in supervisor reports.

**Audit log** (reuse `erp_log_audit`): created_by, approved/rejected_by, date/time, reason, return type, amount.

## 8. Rollout & compatibility

- Flag-gate behind `platform.return_approval` (default OFF). When OFF → today's Direct behavior, zero change.
- Additive migrations (new nullable columns + status values default to current `posted`) → existing returns unaffected.
- Composes with the **Return Workflow Enhancement** (saleable/damage): approval applies to both types; the approved posting routes saleable→van, damage→quarantine per that design.

## 9. Phased plan

| Phase | Deliverable |
| --- | --- |
| A — Settings & permission | `return_policy_mode` + approver setting; `returns.approve` permission; admin settings UI. |
| B — Request/Decide RPCs | `erp_request_van_return` + `erp_decide_van_return` (approve posts, reject + reason); audit; always-on gates. |
| C — Rep UI | Mode-aware button (تأكيد المرتجع / إرسال طلب موافقة / disabled message); approval success screen (visit-oriented). |
| D — Approver UI | Return approvals in the approval queue (approve/reject + reason). |
| E — Reporting & audit | Pending/Approved/Rejected metrics, approval time, approver, rejection reason; audit entries. |

## 10. Testing (next phase)

- Policy resolution: disabled blocks; direct posts now; approval creates pending without stock/AR effect.
- Approve → posts exactly once (idempotent), stock + AR + credit note applied; reject → no effects, reason required, no self-approval.
- Permission: rep cannot approve; only `returns.approve` holders decide.
- Reporting totals reconcile (pending + approved + rejected = all requests); audit completeness.

---

*Design-only. No schema/RPC/UI changes were made. Implementation awaits go-ahead for the separate phase.*
