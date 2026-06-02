/** ── Odoo model/field presets (B5) ──────────────────────────────────────────
 *  Default model + field maps (and inbound domains/fields) per VANTORA entity for
 *  the `odoo` JSON-RPC adapter. Direction follows `mapRecord` (source → dest):
 *    • inbound  (Odoo → VANTORA): { odoo_field: 'vantora_field' }
 *    • outbound (VANTORA → Odoo): { vantora_field: 'odoo_field' }
 *  Presets are DEFAULTS — every sync job may override model/domain/fields/field_map
 *  via job_config. Pure + client-safe; reused by the sync dispatcher. customer and
 *  supplier share `res.partner`, distinguished by the inbound domain. */

export interface OdooPreset {
  key: string;
  entity: string;
  model: string;
  direction: 'in' | 'out';
  /** Field map in `mapRecord` direction (source key → destination key). */
  fieldMap: Record<string, string>;
  /** Inbound Odoo domain filter (search_read), e.g. [['customer_rank','>',0]]. */
  domain?: unknown[];
  /** Inbound fields to fetch (search_read). write_date is added by the runtime. */
  fields?: string[];
}

// ── inbound (Odoo → VANTORA) ──
const PARTNER_CUSTOMER: OdooPreset = {
  key: 'odoo_res_partner_customer', entity: 'customer', model: 'res.partner', direction: 'in',
  domain: [['customer_rank', '>', 0]],
  fields: ['id', 'name', 'phone', 'email', 'city'],
  fieldMap: { id: 'external_id', name: 'name', phone: 'phone', email: 'email', city: 'city' },
};

const PARTNER_SUPPLIER: OdooPreset = {
  key: 'odoo_res_partner_supplier', entity: 'supplier', model: 'res.partner', direction: 'in',
  domain: [['supplier_rank', '>', 0]],
  fields: ['id', 'name', 'phone', 'email'],
  fieldMap: { id: 'external_id', name: 'name', phone: 'phone', email: 'email' },
};

const PRODUCT_TEMPLATE: OdooPreset = {
  key: 'odoo_product_template', entity: 'product', model: 'product.template', direction: 'in',
  domain: [],
  fields: ['id', 'name', 'default_code', 'barcode', 'list_price'],
  fieldMap: { id: 'external_id', name: 'name', default_code: 'code', barcode: 'barcode', list_price: 'sell_price' },
};

// ── outbound (VANTORA → Odoo) — templates; entity-field driven ──
const SALE_ORDER_OUT: OdooPreset = {
  key: 'odoo_sale_order_out', entity: 'order', model: 'sale.order', direction: 'out',
  fieldMap: { external_id: 'client_order_ref', code: 'name' },
};

const ACCOUNT_MOVE_OUT: OdooPreset = {
  key: 'odoo_account_move_out', entity: 'invoice', model: 'account.move', direction: 'out',
  fieldMap: { external_id: 'ref', code: 'payment_reference' },
};

export const ODOO_PRESETS: OdooPreset[] = [
  PARTNER_CUSTOMER, PARTNER_SUPPLIER, PRODUCT_TEMPLATE, SALE_ORDER_OUT, ACCOUNT_MOVE_OUT,
];

const BY_ENTITY_DIRECTION = new Map(ODOO_PRESETS.map((p) => [`${p.entity}:${p.direction}`, p]));

/** Default preset for an entity + direction, or undefined when none. */
export function odooPreset(entity: string, direction: 'in' | 'out'): OdooPreset | undefined {
  return BY_ENTITY_DIRECTION.get(`${entity}:${direction}`);
}
