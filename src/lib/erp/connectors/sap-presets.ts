/** ── SAP file-transport field presets (B3b) ────────────────────────────────
 *  Named field-map presets for the SAP On-Prem / ECC **file (SFTP)** transport.
 *  Customer middleware (SAP Integration Suite / CPI, PI/PO) flattens IDoc
 *  segments to CSV/JSON columns; these presets map those SAP columns to VANTORA
 *  entity fields (inbound) and VANTORA fields to SAP IDoc columns (outbound).
 *
 *  Direction follows `mapRecord` (source key → destination key):
 *    • inbound  (SAP → VANTORA): { SAP_COLUMN: 'vantora_field' }
 *    • outbound (VANTORA → SAP): { vantora_field: 'SAP_COLUMN' }
 *
 *  Presets are DEFAULTS — every sync job may override via `job_config.field_map`.
 *  Pure + client-safe (no node/DB deps); reused by the sync dispatcher.
 *
 *  Boundary: VANTORA only reads/writes the SFTP file drop. IDoc/BAPI ↔ file
 *  bridging is the customer middleware's responsibility — we never touch
 *  RFC/BAPI directly. */

export interface SapFilePreset {
  key: string;
  /** SAP IDoc basic type this preset targets (documentation/UX hint). */
  idoc: string;
  /** VANTORA entity key. */
  entity: string;
  direction: 'in' | 'out';
  /** Field map in `mapRecord` direction (source key → destination key). */
  fieldMap: Record<string, string>;
}

/** Inbound: SAP IDoc-flattened columns → VANTORA entity fields. */
const DEBMAS_CUSTOMER: SapFilePreset = {
  key: 'sap_debmas_customer', idoc: 'DEBMAS', entity: 'customer', direction: 'in',
  fieldMap: {
    KUNNR: 'external_id', // customer number → external id (dedupe key)
    NAME1: 'name',
    TELF1: 'phone',
    SMTP_ADDR: 'email',
    ORT01: 'city',
  },
};

const CREMAS_SUPPLIER: SapFilePreset = {
  key: 'sap_cremas_supplier', idoc: 'CREMAS', entity: 'supplier', direction: 'in',
  fieldMap: {
    LIFNR: 'external_id', // vendor number → external id
    NAME1: 'name',
    TELF1: 'phone',
    SMTP_ADDR: 'email',
  },
};

const MATMAS_PRODUCT: SapFilePreset = {
  key: 'sap_matmas_product', idoc: 'MATMAS', entity: 'product', direction: 'in',
  fieldMap: {
    MATNR: 'external_id', // material number → external id
    MAKTX: 'name',        // material description (E1MAKTM)
    EAN11: 'barcode',
    MEINS: 'unit',        // base unit of measure
  },
};

/** Outbound: VANTORA fields → SAP IDoc columns (templates; entity-field driven). */
const ORDERS_OUT: SapFilePreset = {
  key: 'sap_orders_out', idoc: 'ORDERS', entity: 'order', direction: 'out',
  fieldMap: {
    external_id: 'BELNR', // VANTORA order id → SAP document number
    code: 'BSTKD',        // order code → customer purchase order number
  },
};

const INVOIC_OUT: SapFilePreset = {
  key: 'sap_invoic_out', idoc: 'INVOIC', entity: 'invoice', direction: 'out',
  fieldMap: {
    external_id: 'BELNR', // VANTORA invoice id → SAP billing document number
    code: 'XBLNR',        // invoice code → reference document number
  },
};

export const SAP_FILE_PRESETS: SapFilePreset[] = [
  DEBMAS_CUSTOMER, CREMAS_SUPPLIER, MATMAS_PRODUCT, ORDERS_OUT, INVOIC_OUT,
];

const BY_ENTITY_DIRECTION = new Map(
  SAP_FILE_PRESETS.map((p) => [`${p.entity}:${p.direction}`, p]),
);

/** Default preset for an entity + direction, or undefined when none. */
export function sapFilePreset(entity: string, direction: 'in' | 'out'): SapFilePreset | undefined {
  return BY_ENTITY_DIRECTION.get(`${entity}:${direction}`);
}

/** Default SAP file field-map for an entity + direction (job_config overrides). */
export function sapFileFieldMap(entity: string, direction: 'in' | 'out'): Record<string, string> | undefined {
  return sapFilePreset(entity, direction)?.fieldMap;
}
