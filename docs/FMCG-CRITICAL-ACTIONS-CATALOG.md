# VANTORA — FMCG Critical Actions Catalog

The authoritative list of high-consequence FMCG actions governed by the **Critical
Action standard** (`useCriticalAction` / `CriticalActionButton`): confirm (action /
record / user / timestamp + irreversible warning) → optional reason → execute →
success toast → optional print → **server-side audit**.

Source of truth (code): [`src/lib/erp/critical-actions-catalog.ts`](../src/lib/erp/critical-actions-catalog.ts)
— enforced by `critical-actions-catalog.test.ts` (22 entries, valid enums, bilingual
labels, wired/ready rows point at a real server action).

**Status legend** — `wired`: live behind a `CriticalActionButton` today · `ready`:
company-scoped server action exists, UI wiring is the only remaining step · `planned`:
needs a new server action (or a data model, e.g. expiry).

**Reversal policy** — `reversible` (a plain edit restores prior state) ·
`reverse_entry` (financial: undone only by a compensating entry — credit note /
reversal voucher) · `approval_to_reverse` (reversal itself needs a fresh approval) ·
`irreversible` (cannot be undone — physical disposal / posted period).

## Catalog

| # | Action | Key | Risk | Required role (permission) | Reason | Approval | Reversal | Status |
|---|--------|-----|------|----------------------------|:------:|:--------:|----------|:------:|
| 1 | Invoice finalization | `invoice.finalize` | High | Cashier / Sales Rep (`sales.sell`) | Optional | No | reverse_entry | **wired** |
| 2 | Collection posting | `collection.post` | High | Cashier / Collector (`sales.collect`) | Optional | No | reverse_entry | **wired** |
| 3 | Cash collection adjustment | `collection.adjust` | Critical | Finance / Company Admin (`accounting.post`) | **Mandatory** | **Yes** | approval_to_reverse | planned |
| 4 | Return approval | `return.approve` | High | Supervisor (`sales.return`) | Optional | **Yes** | reverse_entry | **wired** |
| 5 | Return rejection | `return.reject` | Medium | Supervisor (`sales.return`) | **Mandatory** | No | reversible | **wired** |
| 6 | Customer credit limit override | `customer.creditLimitOverride` | High | Sales Manager / Finance (`customers.manage`) | **Mandatory** | **Yes** | reversible | **wired** |
| 7 | Customer activation/deactivation | `customer.statusChange` | High | Supervisor / Company Admin (`customers.manage`) | **Mandatory** | No | reversible | **wired** |
| 8 | Customer GPS change approval | `customer.gpsChangeApproval` | Medium | Supervisor (`customers.manage`) | Optional | **Yes** | reversible | planned |
| 9 | Customer data update approval (CR/VAT/National Address) | `customer.dataUpdateApproval` | Medium | Supervisor (`customers.manage`) | Optional | **Yes** | reversible | **wired** |
| 10 | Price list modification | `pricing.listModify` | High | Pricing Manager (`pricing.manage`) | **Mandatory** | No | reversible | **wired** |
| 11 | Trade spend approval | `tradeSpend.approve` | High | Sales Manager / Finance (`pricing.manage`) | Optional | **Yes** | approval_to_reverse | ready⁴ |
| 12 | Trade spend cancellation | `tradeSpend.cancel` | High | Sales Manager / Finance (`pricing.manage`) | **Mandatory** | **Yes** | irreversible | ready⁴ |
| 13 | Van reconciliation | `van.reconcile` | High | Supervisor / Van Controller (`reports.view`) | **Mandatory** | **Yes** | approval_to_reverse | planned |
| 14 | Van load confirmation | `van.loadConfirm` | Medium | Van Salesman / Supervisor (`field.sales`) | Optional | No | reverse_entry | **wired** |
| 15 | Van unload confirmation | `van.unloadConfirm` | Medium | Van Salesman / Supervisor (`field.sales`) | Optional | No | reverse_entry | planned |
| 16 | Stock transfer approval | `stock.transferApprove` | High | Inventory Controller (`inventory.transfer`) | Optional | **Yes** | reverse_entry | **wired** |
| 17 | Stock adjustment | `stock.adjust` | High | Inventory Controller (`inventory.adjust`) | **Mandatory** | No | reverse_entry | **wired** |
| 18 | Route reassignment | `route.reassign` | Medium | Supervisor / Sales Manager (`customers.manage`) | **Mandatory** | No | reversible | planned |
| 19 | Salesman reassignment | `salesman.reassign` | Medium | Supervisor (`customers.manage`) | Mandatory⁵ | No | reversible | **wired** |
| 20 | Supervisor approval actions | `supervisor.approve` | High | Supervisor / Approver (`approvals.decide`) | Optional | No¹ | approval_to_reverse | **wired**² |
| 21 | Near-expiry write-off | `expiry.writeOff` | High | Inventory Controller / Pharmacist (`inventory.adjust`) | **Mandatory** | No | irreversible | planned³ |
| 22 | Expiry disposal approval | `expiry.disposalApprove` | Critical | Company Admin / QA (`inventory.adjust`) | **Mandatory** | **Yes** | irreversible | planned³ |

¹ The approval action *is* the decision. ² Single-task decisions go through the
standard's confirm + the engine's audit/reason-on-reject; the **bulk** approve path
keeps its native UX (no per-item modal). ³ Blocked on the batch/expiry data model —
see [`PHARMACY-BACKLOG.md`](./PHARMACY-BACKLOG.md). ⁴ Server actions exist + audited +
notified; UI wiring waits on a trade-spend management screen (the dashboard is
read-only and flag-gated). ⁵ Reason is optional **in the journey planning grid** to
keep bulk editing fast; the server still audits + notifies every reassignment.

**Wired today (13):** invoice.finalize, collection.post, return.approve,
return.reject, pricing.listModify, stock.transferApprove, stock.adjust,
customer.statusChange, customer.creditLimitOverride, customer.dataUpdateApproval,
van.loadConfirm, salesman.reassign, supervisor.approve.
**Ready (2):** tradeSpend.approve, tradeSpend.cancel.
**Planned (7):** collection.adjust, customer.gpsChangeApproval, van.reconcile,
van.unloadConfirm, route.reassign, expiry.writeOff, expiry.disposalApprove.

## Notification delivery

Every wired action fires `notifyManagers()` ([`src/lib/erp/notify.ts`](../src/lib/erp/notify.ts))
after it commits → resolves the company's governance recipients (roles `admin`,
`manager`, `supervisor`, `area_manager`) and fans out an `erp_notify` (writes
`erp_notifications`, RLS-scoped). Best-effort: a notification failure never breaks
the action. Precise per-target routing (finance, inventory_controller, the assigned
salesman) is delivered with `erp_action_policies`, where each tenant maps a catalog
action's `notifyTargets` to concrete recipients.

## Audit fields & notification targets (per action)

Every executed action writes an audit row server-side via `erp_log_audit`
(actor stamped from the session — never the client). Notification targets are the
roles/queues that should be informed; delivery uses the existing `erp_notify` RPC.

| Action | Audit fields (`details`) | Notify targets |
|--------|--------------------------|----------------|
| `invoice.finalize` | invoice_id, invoice_number, customer_id, net_amount, status | branch_manager |
| `collection.post` | customer_id, branch_id, amount, method, collection_date | branch_manager |
| `collection.adjust` | collection_id, original_amount, adjusted_amount, reason | finance, branch_manager, company_admin |
| `return.approve` | return_id, customer_id, amount, item_count | salesman, branch_manager |
| `return.reject` | return_id, reason | salesman |
| `customer.creditLimitOverride` | customer_id, old_limit, new_limit, reason | finance, sales_manager |
| `customer.statusChange` | customer_id, is_active_old, is_active_new, reason | salesman, branch_manager |
| `customer.gpsChangeApproval` | customer_id, old_lat, old_lng, new_lat, new_lng | supervisor, salesman |
| `customer.dataUpdateApproval` | customer_id, changed_fields, change_request_id | supervisor |
| `pricing.listModify` | product_id, scope_type, price_type, value, reason | sales_manager |
| `tradeSpend.approve` | agreement_id, customer_id, amount, period | finance, sales_manager |
| `tradeSpend.cancel` | agreement_id, reason, accrued_to_date | finance, sales_manager |
| `van.reconcile` | van_id, route_id, expected_cash, counted_cash, stock_variance | supervisor, finance, branch_manager |
| `van.loadConfirm` | load_id, van_id, item_count, status | supervisor, inventory_controller |
| `van.unloadConfirm` | unload_id, van_id, returned_qty, damaged_qty | supervisor, inventory_controller |
| `stock.transferApprove` | transfer_id, from_warehouse, to_warehouse, item_count | inventory_controller, branch_manager |
| `stock.adjust` | warehouse_id, product_id, delta, reason | inventory_controller, branch_manager |
| `route.reassign` | route_id, old_owner, new_owner, reason | salesman, supervisor |
| `salesman.reassign` | customer_id, old_salesman, new_salesman, visit_day, reason | salesman, supervisor |
| `supervisor.approve` | task_id, workflow_key, decision, comment | approver_queue, salesman |
| `expiry.writeOff` | batch_id, product_id, qty, expiry_date, reason | inventory_controller, branch_manager |
| `expiry.disposalApprove` | disposal_id, batch_ids, total_qty, total_cost, reason | company_admin, finance, inventory_controller |

## How to wire a new flow

```tsx
import { CriticalActionButton } from '@/lib/critical-action';

<CriticalActionButton
  config={{
    catalogKey: 'stock.transferApprove',          // pulls irreversible + reason policy
    action: t('critical.actions.stockTransferApprove'),
    record: transfer.transfer_number,
    execute: async (reason) => {
      const res = await completeTransfer(id);       // server action audits + (optionally) returns printHref
      return { ok: res.ok, error: res.error };
    },
    onDone: () => router.refresh(),
  }}
>
  {t('inventory.completeTransfer')}
</CriticalActionButton>
```

The server action is responsible for the audit (`logAudit`) so it cannot be bypassed
from the client; the `catalogKey` supplies the `irreversible` styling and the reason
requirement, both overridable per call.
