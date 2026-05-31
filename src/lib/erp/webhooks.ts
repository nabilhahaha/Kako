/** ── Outbound Webhooks — shared, pure helpers ──────────────────────────────
 *  Event catalog + validation, safe to import from client components and
 *  unit-testable (no DB/session/node deps). The emit side is entirely DB-driven
 *  (capture triggers in migration 0092); this just describes the events the UI
 *  lets a company subscribe to. Adding an event = one entry here + a trigger. */

export interface WebhookEventDef {
  key: string;            // '{entity}.{action}'
  labelEn: string;
  labelAr: string;
  entity: string;         // grouping in the UI
}

/** Phase 2B starter set (extensible). */
export const WEBHOOK_EVENTS: WebhookEventDef[] = [
  { key: 'customer.created', entity: 'customer', labelEn: 'Customer created', labelAr: 'إنشاء عميل' },
  { key: 'customer.updated', entity: 'customer', labelEn: 'Customer updated', labelAr: 'تحديث عميل' },
  { key: 'supplier.created', entity: 'supplier', labelEn: 'Supplier created', labelAr: 'إنشاء مورد' },
  { key: 'supplier.updated', entity: 'supplier', labelEn: 'Supplier updated', labelAr: 'تحديث مورد' },
  { key: 'product.created', entity: 'product', labelEn: 'Product created', labelAr: 'إنشاء منتج' },
  { key: 'product.updated', entity: 'product', labelEn: 'Product updated', labelAr: 'تحديث منتج' },
  { key: 'invoice.created', entity: 'invoice', labelEn: 'Invoice created', labelAr: 'إنشاء فاتورة' },
  { key: 'approval.completed', entity: 'approval', labelEn: 'Approval completed', labelAr: 'اكتمال موافقة' },
];

const EVENT_KEYS = new Set(WEBHOOK_EVENTS.map((e) => e.key));
export function isKnownWebhookEvent(key: string): boolean {
  return EVENT_KEYS.has(key);
}

/** Event-key shape, kept in sync with the DB-side format check in 0092. */
const EVENT_RE = /^[a-z_]+\.[a-z_]+$/;
export function isValidEventKey(key: string): boolean {
  return EVENT_RE.test(key);
}

/** Delivery endpoints must be HTTPS (matches erp_webhook_create). */
export function isValidWebhookUrl(url: string): boolean {
  return /^https:\/\//i.test(url.trim());
}

/** Webhook events grouped by entity, for the subscribe UI. */
export function webhookEventsByEntity(): Record<string, WebhookEventDef[]> {
  return WEBHOOK_EVENTS.reduce<Record<string, WebhookEventDef[]>>((acc, e) => {
    (acc[e.entity] ??= []).push(e);
    return acc;
  }, {});
}
