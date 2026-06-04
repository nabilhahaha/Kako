/** ── Customer Onboarding — source-system connectors (auto-mapping presets) ──
 *
 *  When a customer migrates off another ERP, the slowest manual step is matching
 *  *their* export columns to *our* entity fields. These presets recognise the
 *  column headers produced by common systems' CSV/XLSX exports and auto-map them
 *  to VANTORA entity fields — the core "hours not weeks" lever for onboarding.
 *
 *  Distinct from the live-sync connector presets (`connectors/*-presets.ts`,
 *  which map JSON-RPC/IDoc fields for the Sync Engine). These are file-import
 *  header aliases used by the Import Wizard's auto-map step. Pure + client-safe.
 *
 *  Aliases per entity: `vantoraFieldKey → [likely source column names]` (both the
 *  human export labels and the technical field names where they differ).
 *  Researched against ERPNext Data Export, Odoo export (technical + label),
 *  SAP Business One, and Dynamics 365 export column conventions.
 */

export interface SourcePreset {
  key: string;       // 'generic' | 'erpnext' | 'odoo'
  labelEn: string;
  labelAr: string;
  /** entityKey → (vantora field key → candidate source column names). */
  aliases: Record<string, Record<string, string[]>>;
}

/** Normalise a header/alias for comparison: lowercase, strip non-alphanumerics
 *  ("Item Code" / "item_code" / "itemCode" → "itemcode"). */
export function normalizeHeader(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

const GENERIC: SourcePreset = {
  key: 'generic', labelEn: 'Generic / VANTORA template', labelAr: 'عام / قالب فانتورا',
  aliases: {},
};

// ── ERPNext (Frappe) Data Export column headers ──
const ERPNEXT: SourcePreset = {
  key: 'erpnext', labelEn: 'ERPNext (Frappe)', labelAr: 'ERPNext (Frappe)',
  aliases: {
    customer: {
      external_id: ['ID', 'name', 'Customer'],
      code: ['Customer', 'Customer Code', 'name'],
      name: ['Customer Name', 'customer_name'],
      phone: ['Mobile No', 'mobile_no', 'Phone', 'phone'],
      email: ['Email Id', 'email_id', 'Email'],
      city: ['City', 'city'],
      credit_limit: ['Credit Limit', 'credit_limit'],
      cr_number: ['Tax ID', 'tax_id'],
      contact_person: ['Customer Primary Contact', 'customer_primary_contact'],
      payment_terms_days: ['Payment Terms', 'payment_terms'],
    },
    supplier: {
      external_id: ['ID', 'name', 'Supplier'],
      code: ['Supplier', 'Supplier Code', 'name'],
      name: ['Supplier Name', 'supplier_name'],
      phone: ['Mobile No', 'mobile_no', 'Phone'],
      email: ['Email Id', 'email_id', 'Email'],
    },
    product: {
      external_id: ['Item Code', 'item_code', 'ID', 'name'],
      code: ['Item Code', 'item_code'],
      name: ['Item Name', 'item_name', 'Item'],
      barcode: ['Barcode', 'barcodes.barcode'],
      unit: ['Default Unit of Measure', 'stock_uom'],
      sell_price: ['Standard Selling Rate', 'standard_rate'],
      cost_price: ['Valuation Rate', 'valuation_rate'],
      brand: ['Brand', 'brand'],
    },
    warehouse: {
      name: ['Warehouse Name', 'warehouse_name'],
      code: ['Warehouse', 'ID', 'name'],
      branch_ref: ['Branch', 'branch', 'Company'],
    },
  },
};

// ── Odoo export column headers (human labels + technical field names) ──
const ODOO: SourcePreset = {
  key: 'odoo', labelEn: 'Odoo', labelAr: 'أودو',
  aliases: {
    customer: {
      external_id: ['External ID', 'id', 'Database ID'],
      code: ['Internal Reference', 'ref', 'Reference'],
      name: ['Name', 'name'],
      phone: ['Phone', 'phone', 'Mobile', 'mobile'],
      email: ['Email', 'email'],
      city: ['City', 'city'],
    },
    supplier: {
      external_id: ['External ID', 'id', 'Database ID'],
      code: ['Internal Reference', 'ref'],
      name: ['Name', 'name'],
      phone: ['Phone', 'phone'],
      email: ['Email', 'email'],
    },
    product: {
      external_id: ['External ID', 'id'],
      code: ['Internal Reference', 'default_code'],
      name: ['Name', 'name'],
      barcode: ['Barcode', 'barcode'],
      unit: ['Unit of Measure', 'uom_id'],
      sell_price: ['Sales Price', 'list_price'],
      cost_price: ['Cost', 'standard_price'],
    },
    warehouse: {
      name: ['Name', 'name'],
      code: ['Short Name', 'code'],
      branch_ref: ['Company', 'company_id'],
    },
  },
};

const PRESETS: SourcePreset[] = [GENERIC, ERPNEXT, ODOO];
const BY_KEY = new Map(PRESETS.map((p) => [p.key, p]));

export function listSourcePresets(): SourcePreset[] {
  return PRESETS;
}
export function getSourcePreset(key: string | undefined | null): SourcePreset | undefined {
  return key ? BY_KEY.get(key) : undefined;
}

export interface AutoMapField { key: string; labelEn: string; labelAr: string }

/**
 * Auto-map file headers to entity field keys. Always tries the field's own
 * key / English / Arabic label; when a source preset + entity are given, the
 * preset's column aliases are tried first. Returns `fieldKey → header` for
 * confident matches only (the caller fills the rest with "ignore").
 */
export function autoMapHeaders(
  headers: readonly string[],
  fields: readonly AutoMapField[],
  preset?: SourcePreset,
  entityKey?: string,
): Record<string, string> {
  const byNorm = new Map<string, string>();
  for (const h of headers) {
    const n = normalizeHeader(h);
    if (n && !byNorm.has(n)) byNorm.set(n, h); // first header wins on collision
  }
  const presetAliases = preset && entityKey ? preset.aliases[entityKey] : undefined;

  const out: Record<string, string> = {};
  for (const f of fields) {
    const candidates: string[] = [
      ...(presetAliases?.[f.key] ?? []),
      f.key, f.labelEn, f.labelAr,
    ];
    for (const c of candidates) {
      const hit = byNorm.get(normalizeHeader(c));
      if (hit) { out[f.key] = hit; break; }
    }
  }
  return out;
}
