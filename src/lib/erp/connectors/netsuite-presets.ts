/** ── NetSuite record-type/field presets (B4) ────────────────────────────────
 *  Default field maps per VANTORA entity for the `netsuite` adapter. Direction
 *  follows `mapRecord` (source → dest):
 *    • inbound  (NetSuite → VANTORA): { netsuite_field: 'vantora_field' }
 *    • outbound (VANTORA → NetSuite): { vantora_field: 'netsuite_field' }
 *  Presets are DEFAULTS — every sync job may override record type / field_map via
 *  job_config. Pure + client-safe; reused by the sync dispatcher. */

export interface NetSuitePreset {
  key: string;
  entity: string;
  recordType: string;
  direction: 'in' | 'out';
  fieldMap: Record<string, string>;
}

// ── inbound (NetSuite → VANTORA) ──
const CUSTOMER: NetSuitePreset = {
  key: 'ns_customer', entity: 'customer', recordType: 'customer', direction: 'in',
  fieldMap: { id: 'external_id', entityId: 'code', companyName: 'name', phone: 'phone', email: 'email' },
};

const VENDOR_SUPPLIER: NetSuitePreset = {
  key: 'ns_vendor_supplier', entity: 'supplier', recordType: 'vendor', direction: 'in',
  fieldMap: { id: 'external_id', entityId: 'code', companyName: 'name', phone: 'phone', email: 'email' },
};

const INVENTORY_ITEM: NetSuitePreset = {
  key: 'ns_inventory_item', entity: 'product', recordType: 'inventoryItem', direction: 'in',
  fieldMap: { id: 'external_id', itemId: 'code', displayName: 'name', upcCode: 'barcode' },
};

// ── outbound (VANTORA → NetSuite) — templates; entity-field driven ──
const SALES_ORDER_OUT: NetSuitePreset = {
  key: 'ns_sales_order_out', entity: 'order', recordType: 'salesOrder', direction: 'out',
  fieldMap: { external_id: 'externalId', code: 'tranId' },
};

const INVOICE_OUT: NetSuitePreset = {
  key: 'ns_invoice_out', entity: 'invoice', recordType: 'invoice', direction: 'out',
  fieldMap: { external_id: 'externalId', code: 'tranId' },
};

export const NETSUITE_PRESETS: NetSuitePreset[] = [
  CUSTOMER, VENDOR_SUPPLIER, INVENTORY_ITEM, SALES_ORDER_OUT, INVOICE_OUT,
];

const BY_ENTITY_DIRECTION = new Map(NETSUITE_PRESETS.map((p) => [`${p.entity}:${p.direction}`, p]));

/** Default preset for an entity + direction, or undefined when none. */
export function netsuitePreset(entity: string, direction: 'in' | 'out'): NetSuitePreset | undefined {
  return BY_ENTITY_DIRECTION.get(`${entity}:${direction}`);
}
