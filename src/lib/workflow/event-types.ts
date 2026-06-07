// ============================================================================
// Event Catalog — the canonical domain event types VANTORA emits onto the bus
// (Constitution Art. 43). Producers import these constants instead of string
// literals so the catalog stays single-sourced and greppable. `entity` is the
// neutral key the Workflow OS matches on (mirrors erp_workflow_definitions.entity).
// ============================================================================

export const EVENT = {
  CUSTOMER_CREATED: 'customer.created',
  CUSTOMER_UPDATED: 'customer.updated',
  CUSTOMER_APPROVED: 'customer.approved',
  ORDER_CREATED: 'order.created',
  ORDER_APPROVED: 'order.approved',
  INVOICE_ISSUED: 'invoice.issued',
  INVOICE_VOIDED: 'invoice.voided',
  PAYMENT_RECEIVED: 'payment.received',
  RETURN_APPROVED: 'return.approved',
  VISIT_COMPLETED: 'visit.completed',
  STOCK_TRANSFER_COMPLETED: 'stock_transfer.completed',
} as const;

export type EventType = typeof EVENT[keyof typeof EVENT];

/** event_type → neutral entity key (for workflow matching / catalog docs). */
export const EVENT_ENTITY: Record<EventType, string> = {
  'customer.created': 'customer',
  'customer.updated': 'customer',
  'customer.approved': 'customer',
  'order.created': 'order',
  'order.approved': 'order',
  'invoice.issued': 'invoice',
  'invoice.voided': 'invoice',
  'payment.received': 'payment',
  'return.approved': 'return',
  'visit.completed': 'visit',
  'stock_transfer.completed': 'stock_transfer',
};
