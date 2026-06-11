# VANTORA FMCG — Gaps vs. Enterprise FMCG Systems

Scope: how VANTORA's FMCG control/governance layer compares to enterprise FMCG /
distribution suites (SAP S/4 + DSD, Oracle, ic-RDS / FieldAssist / Bizom-class DMS).
This is the gap register that the Critical Action catalog feeds into; it is a
planning artifact, not a claim of parity.

Legend: ✅ have · 🟡 partial · 🔜 planned/gap.

## 1. Transaction governance & audit

| Capability | Enterprise norm | VANTORA | Notes |
|---|---|---|---|
| Confirm-before-commit on critical actions | ✅ universal | ✅ | `useCriticalAction` standard; 8 FMCG flows wired. |
| Mandatory reason capture | ✅ | 🟡 | Enforced where wired; not yet per-tenant configurable. |
| Immutable, queryable audit trail | ✅ | ✅ | `erp_log_audit` (actor stamped server-side). |
| Maker–checker / segregation of duties | ✅ | 🟡 | Generic workflow engine (`erp_workflow_*`) exists; not applied to every critical action yet. |
| Reason/approval **policy engine** (per tenant) | ✅ | 🔜 | Today reason/approval are code constants in the catalog; should be a `erp_action_policies` table. |
| e-signature / OTP on high-risk approvals | ✅ (regulated) | 🔜 | Not present. |

## 2. Reversal & financial integrity

| Capability | Enterprise norm | VANTORA | Notes |
|---|---|---|---|
| Reversal as compensating entry (no hard delete) | ✅ | ✅ | Invoices/returns/collections post journals; reversal = credit note / voucher. |
| Collection void / adjustment with approval | ✅ | 🔜 | `collection.adjust` is planned (no action yet). |
| Period close / posting lock | ✅ | 🟡 | Accounting exists; explicit period-lock + reopen-with-approval gap. |
| Trade-spend accrual reversal | ✅ | 🔜 | Trade spend is reporting-only today. |

## 3. Van / DSD (direct store delivery)

| Capability | Enterprise norm | VANTORA | Notes |
|---|---|---|---|
| Van load confirmation | ✅ | 🟡 | `confirmLoad` exists; bring under standard (`ready`). |
| Van unload / return-to-warehouse | ✅ | 🔜 | No unload-confirm action. |
| End-of-day van reconciliation (cash + stock variance) | ✅ | 🔜 | UI reads `erp_van_reconciliations`; no confirm/approve action. |
| Route/journey planning + adherence | ✅ | 🟡 | Journey assignment + perfect-store scoring exist; route-reassign approval gap. |
| Offline-first field app | ✅ | 🟡 | Offline sync foundation exists. |

## 4. Inventory & expiry (regulated FMCG / pharma)

| Capability | Enterprise norm | VANTORA | Notes |
|---|---|---|---|
| Stock transfer with approval | ✅ | ✅ | `stock.transferApprove` wired. |
| Stock adjustment with reason + audit | ✅ | ✅ | `stock.adjust` wired. |
| **Batch / lot tracking** | ✅ | 🔜 | Backlog B1/B3 (`PHARMACY-BACKLOG.md`). |
| **Expiry (FEFO) + write-off / disposal** | ✅ | 🔜 | Backlog B2/B5; `expiry.*` catalog rows blocked on the model. |
| Dead-stock / slow-mover engine | ✅ | 🟡 | Demo-grade reports exist; needs a reusable engine (B4). |
| Serialized / cold-chain traceability | ✅ (pharma) | 🔜 | Not present. |

## 5. Customer & trade management

| Capability | Enterprise norm | VANTORA | Notes |
|---|---|---|---|
| Credit limit with approval workflow | ✅ | 🟡 | `requestCreditLimitChange` via workflow engine (`ready`). |
| Customer master-data change approval | ✅ | 🟡 | Generic change-request workflow (`ready`); GPS-specific approval gap. |
| Customer activation/deactivation governance | ✅ | ✅ | `customer.statusChange` wired (reason + audit). |
| **Trade promotion management (TPM)** | ✅ | 🔜 | Approval/cancellation actions planned; no accrual/settlement engine. |
| Pricing/condition records with effective dating | ✅ | ✅ | Price rules + lists with valid-from/to; modification governed. |

## 6. Notifications & escalation

| Capability | Enterprise norm | VANTORA | Notes |
|---|---|---|---|
| Notify stakeholders on critical commit | ✅ | 🟡 | `erp_notify` RPC exists; not yet fired from each action. |
| SLA-based escalation on pending approvals | ✅ | 🔜 | Workflow tasks exist; time-based escalation gap. |

## Prioritized closure plan

1. **Notification delivery** — fire `erp_notify` to each action's `notifyTargets`
   on commit (cheap, high visibility). *Effort: S.*
2. **Action-policy table** (`erp_action_policies`) — make reason/approval/risk
   per-tenant configurable; the catalog becomes the seeded default. *Effort: M.*
3. **Wire the 5 `ready` flows** — credit-limit override, data-update approval,
   van-load confirm, salesman reassignment, supervisor approval surfacing. *Effort: M.*
4. **Van DSD completion** — unload confirmation + end-of-day reconciliation as
   critical actions (cash + stock variance). *Effort: M–L.*
5. **Batch/expiry data model** (B1/B2/B5) — unlocks near-expiry write-off and
   disposal approval, plus FEFO picking. *Effort: L.*
6. **Trade Promotion Management** — agreement model + accrual/settlement +
   approval/cancellation actions. *Effort: L (a module in its own right).*
7. **Period-lock + maker–checker coverage** — extend the workflow engine to
   high-risk financial actions and add posting-period locks. *Effort: M.*
