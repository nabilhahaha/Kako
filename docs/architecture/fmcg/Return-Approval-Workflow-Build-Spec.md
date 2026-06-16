# Return Approval Workflow — Policy-Driven Design (Build Spec)

**Status:** DESIGN approved → implementation starting. Supersedes the earlier `Return-Approval-Policy-Design.md` with value thresholds, approval levels, and the 5-permission model. Grounded in the **Permission & Role Policy Audit**.
**Flag:** `platform.return_approval` (default OFF) — when OFF the current Direct (open) returns behavior is unchanged.

---

## 1. Workflow design

### 1.1 Policy modes (per company; per-return-type + threshold overrides)

| Mode | Rep creates? | Posting | Inventory / Credit |
| --- | --- | --- | --- |
| **Open** | Yes | Immediate on confirm | Applied immediately (today's `erp_van_return`) |
| **Approval required** | Yes → a **request** | Held `pending_approval` | **None** until approved (no stock move, no credit note) |
| **Closed** | No | — | Tile hidden / disabled; message "المرتجعات غير مفعلة لهذا الدور" |

### 1.2 Policy resolution (per return) — pure, testable

```
resolveReturnPolicy(returnType, valueSAR, policy):
  if mode = closed                       → BLOCKED
  if type rule = always_approval         → APPROVAL  (e.g. Damage)
  if value ≤ autoApproveLimit(type)      → AUTO  (post immediately)
  else                                   → APPROVAL (route to the configured level)
```

**Example config (Saleable):** 0–500 → Auto · >500 → Supervisor. **Damage:** always Approval.

### 1.3 Approval levels (which role decides, by threshold band)

`Supervisor` · `Branch Manager` · `Company Admin`. The company maps a **value band → level** per return type (e.g. ≤1000 → Supervisor, ≤5000 → Branch Manager, >5000 → Company Admin). Pilot ships single-level (Supervisor) with the schema ready for bands.

### 1.4 State machine

```
draft → pending_approval → approved → posted
                         └→ rejected (reason required) → (no effects)
Open mode: draft → posted (immediate)
```

### 1.5 On decision

- **Approve:** run the existing atomic posting path (stock `return_in`, credit note, AR) **once** (idempotent); status → `posted`; audit (approver, time).
- **Reject:** status → `rejected`; **rejection reason required**; **no** stock / no financial impact; audit.

---

## 2. Permission mapping

Five permissions (added to `permissions.ts`):

| Permission | Meaning |
| --- | --- |
| `returns.create` | Create a return / return request |
| `returns.approve` | Approve a pending return request |
| `returns.reject` | Reject a pending return request (with reason) |
| `returns.override` | Override the policy (e.g. force auto-post, or approve own when policy permits) |
| `returns.view_all` | View all returns (company/branch scope) for reports |

**Role assignment (aligned to the audit's SoD):**

| Role | create | approve | reject | override | view_all |
| --- | --- | --- | --- | --- | --- |
| salesman / driver | ✓ | — | — | — | — |
| supervisor | ✓ | ✓ | ✓ | — | ✓ |
| branch_manager | ✓ | ✓ | ✓ | ✓ | ✓ |
| area/regional/director | ✓ | ✓ | ✓ | ✓ | ✓ |
| accountant | — | — | — | — | ✓ |
| admin / manager / apex | ✓ | ✓ | ✓ | ✓ | ✓ |

> Note: today reps return via `field.sales` (no `sales.return`). `returns.create` aliases to that path; `field.sales` holders get `returns.create` so nothing regresses. Decide-side gated by `returns.approve` / `returns.reject` **always-on** (G1 pattern), never self-approve.

---

## 3. Screen mockups

**Salesman — return screen (mode-aware button):** Open → "تأكيد المرتجع" · Approval → "إرسال طلب موافقة" · Closed → disabled + message. After submitting a request → visit-oriented success: **"تم إرسال طلب المرتجع للموافقة"** · Primary "العميل التالي" · Secondary "إجراء آخر لنفس العميل".

**Salesman — My Returns** (`/field/van-sales/returns`), three tabs:
```
[ Pending ]  [ Approved ]  [ Rejected ]
RET-…  Customer  Type(Saleable/Damage)  Value  Status  ⏱ requested 10:22
```

**Approver — Pending queue** (`/approvals/returns` + in the approval hub):
```
RET-…  Salesman  Customer  Type  SKUs(n)  Qty  Value  Reason
[ Approve ]   [ Reject + comment ]
```

**Reports** (`/distribution/returns-approval`): Pending · Approved · Rejected counts + value; **Average approval time**; **Return value by approver**; filter by type/period.

---

## 4. Data model

- `erp_sales_returns` += `status` (extend: `pending_approval | approved | rejected | posted`), `return_type` (`saleable|damage` — composes with the Damage split), `value_amount`, `requested_by/at`, `approved_by/at`, `rejected_by/at`, `rejection_reason`, `approval_level`.
- `erp_return_policies` (company): `mode`, per-type `{ requireApproval, autoApproveLimit }`, level bands `{ maxValue → level }`, approver role/user.
- Additive + nullable; existing returns = `posted`/`saleable`. Flag-gated.

## 5. RPCs (always-on gated; no self-approve)

- `erp_request_van_return(...)` → inserts `pending_approval`, **no** stock/AR; returns request id. Gated `returns.create` (→ `field.sales`).
- `erp_decide_van_return(id, decision, reason)` → approve runs the existing posting path once (idempotent); reject sets reason. Gated `returns.approve`/`returns.reject`. `SECURITY DEFINER`, audited (`erp_log_audit`).
- Auto path (value ≤ limit, type not always-approval) → posts immediately via existing `erp_van_return`.

## 6. Implementation plan (phased)

| Phase | Deliverable |
| --- | --- |
| **A — Foundation** | 5 permissions + role map; `erp_return_policies` + return status/approval columns; pure `resolveReturnPolicy` + threshold logic (unit-tested); flag + company settings UI. |
| **B — RPCs** | `erp_request_van_return` + `erp_decide_van_return` (approve posts once / reject+reason / no self-approve / audit); auto-post path; integration tests. |
| **C — Salesman UI** | Mode-aware return button; approval success screen; **My Returns** (Pending/Approved/Rejected). |
| **D — Approver UI** | Pending queue (approve / reject + comment) in the approvals hub. |
| **E — Reports** | Pending/Approved/Rejected + value, avg approval time, value by approver. |

## 7. Testing

- Policy resolution at thresholds (0/500/above; damage always-approval; closed blocks).
- Request creates pending with **no** stock/AR; approve posts exactly once (idempotent) + stock+AR+credit; reject → no effects + reason required + no self-approve.
- Permission gating (rep can't approve; only approver decides; override honored).
- Reports reconcile (pending+approved+rejected = all requests); audit completeness.

---

*Design approved. Implementation begins at Phase A (permissions + policy logic + schema), flag-gated `platform.return_approval` (default OFF). Role Builder is NOT part of this work.*
