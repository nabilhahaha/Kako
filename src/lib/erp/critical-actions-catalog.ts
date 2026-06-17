/**
 * VANTORA — FMCG Critical Action Catalog.
 *
 * The single, authoritative registry of every high-consequence FMCG action that
 * must go through the Critical Action standard (confirm → optional reason →
 * execute → success → optional print → server-side audit). It is pure data (no
 * React), so it is shared by:
 *   • the client hook (`useCriticalAction`) — pulls `irreversible` / reason
 *     defaults and risk styling from the spec by `catalogKey`;
 *   • the catalog doc (docs/FMCG-CRITICAL-ACTIONS-CATALOG.md) — generated from
 *     these rows;
 *   • a completeness test (critical-actions-catalog.test.ts).
 *
 * `status` is the wiring state, kept honest:
 *   • 'wired'   — live behind a CriticalActionButton in the UI today.
 *   • 'ready'   — a company-scoped server action exists; UI wiring is the only
 *                 remaining step.
 *   • 'planned' — needs a new server action (or a data model, e.g. expiry).
 */

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** How an executed action can be undone. */
export type ReversalPolicy =
  | 'reversible'          // a plain edit can restore the prior state
  | 'reverse_entry'       // financial: undone only by a compensating entry (credit note / reversal voucher)
  | 'approval_to_reverse' // reversal itself requires a fresh approval
  | 'irreversible';       // cannot be undone (physical disposal, posted period)

export type WireStatus = 'wired' | 'ready' | 'planned';

export type CriticalDomain =
  | 'sales' | 'collections' | 'returns' | 'customer'
  | 'pricing' | 'trade' | 'van' | 'inventory' | 'field' | 'approvals' | 'expiry';

/** Who is notified after the action commits (roles/queues, not individuals). */
export type NotifyTarget =
  | 'customer' | 'salesman' | 'supervisor' | 'branch_manager'
  | 'sales_manager' | 'finance' | 'inventory_controller'
  | 'company_admin' | 'approver_queue';

export interface CriticalActionSpec {
  /** Stable catalog key, also the `catalogKey` passed to useCriticalAction. */
  key: string;
  /** i18n key for the action verb shown in the confirm title. */
  labelKey: string;
  domain: CriticalDomain;
  risk: RiskLevel;
  /** The permission/capability the server action enforces. */
  requiredPermission: string;
  /** Human-readable minimum role (for the catalog/doc). */
  requiredRole: string;
  reasonRequired: boolean;
  /** Routes through the approval workflow engine (erp_workflow_*) or a supervisor gate. */
  approvalRequired: boolean;
  /** Drives destructive styling + the "cannot be undone" warning line. */
  irreversible: boolean;
  /** Fields captured in the audit `details` payload (server-side). */
  auditFields: string[];
  notifyTargets: NotifyTarget[];
  reversalPolicy: ReversalPolicy;
  status: WireStatus;
  /** file#function of the server action, when one exists. */
  actionRef?: string;
}

export const CRITICAL_ACTIONS: CriticalActionSpec[] = [
  // ─── Sales / invoicing ────────────────────────────────────────────────────
  {
    key: 'invoice.finalize', labelKey: 'critical.actions.invoiceFinalize', domain: 'sales',
    risk: 'high', requiredPermission: 'sales.sell', requiredRole: 'Cashier / Sales Rep',
    reasonRequired: false, approvalRequired: false, irreversible: true,
    auditFields: ['invoice_id', 'invoice_number', 'customer_id', 'net_amount', 'status'],
    notifyTargets: ['branch_manager'], reversalPolicy: 'reverse_entry', status: 'wired',
    actionRef: 'sales/invoices/actions.ts#issueInvoice',
  },
  // ─── Collections ──────────────────────────────────────────────────────────
  {
    key: 'collection.post', labelKey: 'critical.actions.collectionPost', domain: 'collections',
    risk: 'high', requiredPermission: 'sales.collect', requiredRole: 'Cashier / Collector',
    reasonRequired: false, approvalRequired: false, irreversible: true,
    auditFields: ['customer_id', 'branch_id', 'amount', 'method', 'collection_date'],
    notifyTargets: ['branch_manager'], reversalPolicy: 'reverse_entry', status: 'wired',
    actionRef: 'collections/actions.ts#recordCollection',
  },
  {
    key: 'collection.adjust', labelKey: 'critical.actions.collectionAdjust', domain: 'collections',
    risk: 'critical', requiredPermission: 'accounting.post', requiredRole: 'Finance / Company Admin',
    reasonRequired: true, approvalRequired: true, irreversible: true,
    auditFields: ['collection_id', 'original_amount', 'adjusted_amount', 'reason'],
    notifyTargets: ['finance', 'branch_manager', 'company_admin'], reversalPolicy: 'approval_to_reverse', status: 'planned',
  },
  // ─── Returns ──────────────────────────────────────────────────────────────
  {
    key: 'return.approve', labelKey: 'critical.actions.returnApprove', domain: 'returns',
    risk: 'high', requiredPermission: 'sales.return', requiredRole: 'Supervisor',
    reasonRequired: false, approvalRequired: true, irreversible: true,
    auditFields: ['return_id', 'customer_id', 'amount', 'item_count'],
    notifyTargets: ['salesman', 'branch_manager'], reversalPolicy: 'reverse_entry', status: 'wired',
    actionRef: 'sales/returns/actions.ts#completeReturn',
  },
  {
    key: 'return.reject', labelKey: 'critical.actions.returnReject', domain: 'returns',
    risk: 'medium', requiredPermission: 'sales.return', requiredRole: 'Supervisor',
    reasonRequired: true, approvalRequired: false, irreversible: false,
    auditFields: ['return_id', 'reason'],
    notifyTargets: ['salesman'], reversalPolicy: 'reversible', status: 'wired',
    actionRef: 'sales/returns/actions.ts#cancelReturn',
  },
  // ─── Customer master-data ─────────────────────────────────────────────────
  {
    key: 'customer.creditLimitOverride', labelKey: 'critical.actions.creditLimitOverride', domain: 'customer',
    risk: 'high', requiredPermission: 'customers.manage', requiredRole: 'Sales Manager / Finance',
    reasonRequired: true, approvalRequired: true, irreversible: false,
    auditFields: ['customer_id', 'old_limit', 'new_limit', 'reason'],
    notifyTargets: ['finance', 'sales_manager'], reversalPolicy: 'reversible', status: 'wired',
    actionRef: 'customers/actions.ts#requestCreditLimitChange',
  },
  {
    key: 'customer.statusChange', labelKey: 'critical.actions.customerStatusChange', domain: 'customer',
    risk: 'high', requiredPermission: 'customers.manage', requiredRole: 'Supervisor / Company Admin',
    reasonRequired: true, approvalRequired: false, irreversible: false,
    auditFields: ['customer_id', 'is_active_old', 'is_active_new', 'reason'],
    notifyTargets: ['salesman', 'branch_manager'], reversalPolicy: 'reversible', status: 'wired',
    actionRef: 'customers/actions.ts#toggleCustomerActive',
  },
  {
    key: 'customer.gpsChangeApproval', labelKey: 'critical.actions.gpsChangeApproval', domain: 'customer',
    risk: 'medium', requiredPermission: 'customers.manage', requiredRole: 'Supervisor',
    reasonRequired: false, approvalRequired: true, irreversible: false,
    auditFields: ['customer_id', 'old_lat', 'old_lng', 'new_lat', 'new_lng'],
    notifyTargets: ['supervisor', 'salesman'], reversalPolicy: 'reversible', status: 'planned',
  },
  {
    key: 'customer.dataUpdateApproval', labelKey: 'critical.actions.dataUpdateApproval', domain: 'customer',
    risk: 'medium', requiredPermission: 'customers.manage', requiredRole: 'Supervisor',
    reasonRequired: false, approvalRequired: true, irreversible: false,
    auditFields: ['customer_id', 'changed_fields', 'change_request_id'],
    notifyTargets: ['supervisor'], reversalPolicy: 'reversible', status: 'wired',
    actionRef: 'customers/actions.ts#requestCustomerApproval',
  },
  // ─── Pricing / trade spend ────────────────────────────────────────────────
  {
    key: 'pricing.listModify', labelKey: 'critical.actions.priceListModify', domain: 'pricing',
    risk: 'high', requiredPermission: 'pricing.manage', requiredRole: 'Pricing Manager',
    reasonRequired: true, approvalRequired: false, irreversible: false,
    auditFields: ['product_id', 'scope_type', 'price_type', 'value', 'reason'],
    notifyTargets: ['sales_manager'], reversalPolicy: 'reversible', status: 'wired',
    actionRef: 'sales/pricing/actions.ts#upsertPriceRule',
  },
  {
    key: 'tradeSpend.approve', labelKey: 'critical.actions.tradeSpendApprove', domain: 'trade',
    risk: 'high', requiredPermission: 'pricing.manage', requiredRole: 'Sales Manager / Finance',
    reasonRequired: false, approvalRequired: true, irreversible: false,
    auditFields: ['agreement_id', 'customer_id', 'amount', 'period'],
    notifyTargets: ['finance', 'sales_manager'], reversalPolicy: 'approval_to_reverse', status: 'ready',
    actionRef: 'distribution/trade-spend/actions.ts#approveTradeSpend',
  },
  {
    key: 'tradeSpend.cancel', labelKey: 'critical.actions.tradeSpendCancel', domain: 'trade',
    risk: 'high', requiredPermission: 'pricing.manage', requiredRole: 'Sales Manager / Finance',
    reasonRequired: true, approvalRequired: true, irreversible: true,
    auditFields: ['agreement_id', 'reason', 'accrued_to_date'],
    notifyTargets: ['finance', 'sales_manager'], reversalPolicy: 'irreversible', status: 'ready',
    actionRef: 'distribution/trade-spend/actions.ts#cancelTradeSpend',
  },
  // ─── Van operations ───────────────────────────────────────────────────────
  {
    key: 'van.reconcile', labelKey: 'critical.actions.vanReconcile', domain: 'van',
    risk: 'high', requiredPermission: 'reports.view', requiredRole: 'Supervisor / Van Controller',
    reasonRequired: true, approvalRequired: true, irreversible: true,
    auditFields: ['van_id', 'route_id', 'expected_cash', 'counted_cash', 'stock_variance'],
    notifyTargets: ['supervisor', 'finance', 'branch_manager'], reversalPolicy: 'approval_to_reverse', status: 'planned',
  },
  {
    key: 'van.loadConfirm', labelKey: 'critical.actions.vanLoadConfirm', domain: 'van',
    risk: 'medium', requiredPermission: 'field.sales', requiredRole: 'Van Salesman / Supervisor',
    reasonRequired: false, approvalRequired: false, irreversible: true,
    auditFields: ['load_id', 'van_id', 'item_count', 'status'],
    notifyTargets: ['supervisor', 'inventory_controller'], reversalPolicy: 'reverse_entry', status: 'wired',
    actionRef: 'field/van-sales/actions.ts#confirmLoad',
  },
  {
    key: 'van.unloadConfirm', labelKey: 'critical.actions.vanUnloadConfirm', domain: 'van',
    risk: 'medium', requiredPermission: 'field.sales', requiredRole: 'Van Salesman / Supervisor',
    reasonRequired: false, approvalRequired: false, irreversible: true,
    auditFields: ['unload_id', 'van_id', 'returned_qty', 'damaged_qty'],
    notifyTargets: ['supervisor', 'inventory_controller'], reversalPolicy: 'reverse_entry', status: 'planned',
  },
  // ─── Inventory ────────────────────────────────────────────────────────────
  {
    key: 'stock.transferApprove', labelKey: 'critical.actions.stockTransferApprove', domain: 'inventory',
    risk: 'high', requiredPermission: 'inventory.transfer', requiredRole: 'Inventory Controller',
    reasonRequired: false, approvalRequired: true, irreversible: true,
    auditFields: ['transfer_id', 'from_warehouse', 'to_warehouse', 'item_count'],
    notifyTargets: ['inventory_controller', 'branch_manager'], reversalPolicy: 'reverse_entry', status: 'wired',
    actionRef: 'inventory/transfers/actions.ts#completeTransfer',
  },
  {
    key: 'stock.adjust', labelKey: 'critical.actions.stockAdjust', domain: 'inventory',
    risk: 'high', requiredPermission: 'inventory.adjust', requiredRole: 'Inventory Controller',
    reasonRequired: true, approvalRequired: false, irreversible: true,
    auditFields: ['warehouse_id', 'product_id', 'delta', 'reason'],
    notifyTargets: ['inventory_controller', 'branch_manager'], reversalPolicy: 'reverse_entry', status: 'wired',
    actionRef: 'inventory/actions.ts#adjustStock',
  },
  // ─── Field assignment ─────────────────────────────────────────────────────
  {
    key: 'route.reassign', labelKey: 'critical.actions.routeReassign', domain: 'field',
    risk: 'medium', requiredPermission: 'customers.manage', requiredRole: 'Supervisor / Sales Manager',
    reasonRequired: true, approvalRequired: false, irreversible: false,
    auditFields: ['route_id', 'old_owner', 'new_owner', 'reason'],
    notifyTargets: ['salesman', 'supervisor'], reversalPolicy: 'reversible', status: 'planned',
  },
  {
    key: 'salesman.reassign', labelKey: 'critical.actions.salesmanReassign', domain: 'field',
    risk: 'medium', requiredPermission: 'customers.manage', requiredRole: 'Supervisor',
    reasonRequired: true, approvalRequired: false, irreversible: false,
    auditFields: ['customer_id', 'old_salesman', 'new_salesman', 'visit_day', 'reason'],
    notifyTargets: ['salesman', 'supervisor'], reversalPolicy: 'reversible', status: 'wired',
    actionRef: 'customers/actions.ts#setCustomerJourney',
  },
  // ─── Approvals (generic supervisor gate) ──────────────────────────────────
  {
    key: 'supervisor.approve', labelKey: 'critical.actions.supervisorApprove', domain: 'approvals',
    risk: 'high', requiredPermission: 'approvals.decide', requiredRole: 'Supervisor / Approver',
    reasonRequired: false, approvalRequired: false, irreversible: false,
    auditFields: ['task_id', 'workflow_key', 'decision', 'comment'],
    notifyTargets: ['approver_queue', 'salesman'], reversalPolicy: 'approval_to_reverse', status: 'wired',
    actionRef: 'approvals/actions.ts#decideTask',
  },
  // ─── Expiry (blocked on the batch/expiry data model — see PHARMACY-BACKLOG) ─
  {
    key: 'expiry.writeOff', labelKey: 'critical.actions.expiryWriteOff', domain: 'expiry',
    risk: 'high', requiredPermission: 'inventory.adjust', requiredRole: 'Inventory Controller / Pharmacist',
    reasonRequired: true, approvalRequired: false, irreversible: true,
    auditFields: ['batch_id', 'product_id', 'qty', 'expiry_date', 'reason'],
    notifyTargets: ['inventory_controller', 'branch_manager'], reversalPolicy: 'irreversible', status: 'planned',
  },
  {
    key: 'expiry.disposalApprove', labelKey: 'critical.actions.expiryDisposalApprove', domain: 'expiry',
    risk: 'critical', requiredPermission: 'inventory.adjust', requiredRole: 'Company Admin / QA',
    reasonRequired: true, approvalRequired: true, irreversible: true,
    auditFields: ['disposal_id', 'batch_ids', 'total_qty', 'total_cost', 'reason'],
    notifyTargets: ['company_admin', 'finance', 'inventory_controller'], reversalPolicy: 'irreversible', status: 'planned',
  },
];

/** Fast lookup by catalog key. */
export const CRITICAL_ACTIONS_BY_KEY: Record<string, CriticalActionSpec> =
  Object.fromEntries(CRITICAL_ACTIONS.map((a) => [a.key, a]));

export function getCriticalActionSpec(key: string): CriticalActionSpec | undefined {
  return CRITICAL_ACTIONS_BY_KEY[key];
}
