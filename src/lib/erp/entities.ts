/** ── VANTORA Entity Framework — the registry ───────────────────────────────
 *
 * Single source of truth for every business object ("entity") in the platform.
 * The framework gives EVERY entity the same cross-cutting capabilities by
 * default — import, export, API access, audit log, attachments, notes, custom
 * fields, permissions — built once here, not per module.
 *
 * "Create once. Reuse everywhere." Adding a module = registering its entity
 * descriptor below; it then inherits all capabilities automatically. The
 * registry is entity-based, NEVER business-type based, so the same engine serves
 * retail, FMCG, clinics, manufacturing, warehouses, services, distribution, and
 * corporate. See docs/ENTITY-FRAMEWORK.md.
 */

import type { Permission } from './permissions';
import type { RefSpec, RefFieldDef } from './import-refs';

/** A field on an entity, used by import/export column ↔ field mapping. */
export interface EntityField {
  /** DB column / writer key, e.g. 'name', 'code', 'phone'. */
  key: string;
  labelAr: string;
  labelEn: string;
  type?: 'text' | 'number' | 'date' | 'email' | 'boolean' | 'ref';
  required?: boolean;
  /** Severity if this field fails its check. 'error' blocks import; 'warning'
   *  allows import; 'info' is advisory. Defaults to 'error' for required fields. */
  severity?: 'error' | 'warning' | 'info';
  /** For `type: 'ref'` fields — how to resolve the human value (code/number) to a
   *  foreign-key id before insert. A ref field carries a business identifier; the
   *  import engine batch-resolves it to `ref.column` and strips the `*_ref` key. */
  ref?: RefSpec;
}

/** Which audit/stamp columns a backing table actually has. The import engine only
 *  writes a stamp column when it exists. When `stamps` is omitted the engine uses
 *  the legacy master-data defaults (all true) for backward compatibility. */
export interface EntityStamps {
  importJobId?: boolean;
  createdBy?: boolean;
  updatedBy?: boolean;
  updatedAt?: boolean;
  custom?: boolean;
}

/** How the import engine treats rows that match an existing record. */
export type ImportMode = 'insert' | 'update' | 'upsert' | 'skip';

/** Cross-cutting capabilities every entity inherits (default ON). */
export interface EntityCapabilities {
  importable: boolean;
  exportable: boolean;
  apiAccess: boolean;
  audit: boolean;
  attachments: boolean;
  notes: boolean;
  customFields: boolean;
}

export interface EntityDescriptor {
  /** Neutral entity id, e.g. 'customer', 'product', 'invoice'. */
  key: string;
  /** Backing table, e.g. 'erp_customers'. */
  table: string;
  labelAr: string;
  labelEn: string;
  /** Permission that gates managing this entity (used by the matrix + UI). */
  permission?: Permission;
  /** Import/export field map. */
  fields?: EntityField[];
  /** Field key that uniquely identifies a record for update/upsert (defaults to
   *  'external_id' when present). */
  uniqueKey?: string;
  /** Field keys used to detect duplicates within a file / against existing rows
   *  (defaults to [uniqueKey] or the first required field). */
  dedupeKeys?: string[];
  /** Entity keys this entity references — used to recommend an import order
   *  (parents before children) so FK resolution succeeds. E.g. invoice_line
   *  `dependsOn: ['invoice','product']`. */
  dependsOn?: string[];
  /** Audit/stamp columns the backing table supports. Omit for the legacy
   *  master-data set (all true). Child/transactional tables that lack these
   *  columns must declare exactly what they have. */
  stamps?: EntityStamps;
  /** Capability overrides; anything omitted defaults to ON. */
  capabilities?: Partial<EntityCapabilities>;
}

const ALL_ON: EntityCapabilities = {
  importable: true, exportable: true, apiAccess: true, audit: true,
  attachments: true, notes: true, customFields: true,
};

const f = (key: string, ar: string, en: string, extra: Partial<EntityField> = {}): EntityField =>
  ({ key, labelAr: ar, labelEn: en, ...extra });

/** The registry. Core entities today; add a descriptor to onboard a new module
 *  (or a future custom entity) with all capabilities inherited automatically. */
const REGISTRY: EntityDescriptor[] = [
  {
    key: 'customer', table: 'erp_customers', labelAr: 'العملاء', labelEn: 'Customers',
    permission: 'customers.manage', uniqueKey: 'external_id', dedupeKeys: ['external_id', 'code'],
    fields: [
      f('code', 'الكود', 'Code'),
      f('name', 'الاسم', 'Name', { required: true }),
      f('name_ar', 'الاسم بالعربية', 'Name (Arabic)'),
      f('phone', 'الهاتف', 'Phone'),
      f('email', 'البريد', 'Email', { type: 'email' }),
      f('city', 'المدينة', 'City'),
      f('credit_limit', 'حد الائتمان', 'Credit limit', { type: 'number' }),
      // FMCG hierarchy S3 — scalar customer attributes (segment/classification/
      // channel/region/area are FK master data set via the form, not imported here).
      f('cr_number', 'السجل التجاري', 'CR Number'),
      f('tax_number', 'الرقم الضريبي', 'VAT Number'),
      f('national_address', 'العنوان الوطني', 'National Address'),
      f('contact_person', 'مسؤول التواصل', 'Contact Person'),
      f('contact_phone', 'هاتف التواصل', 'Contact Phone'),
      f('payment_terms_days', 'مدة السداد (يوم)', 'Payment Terms (days)', { type: 'number' }),
      // FR-2/FR-3: customer-level visit frequency (primary source of truth over
      // classification). Canonical token (weekly|biweekly|monthly|annual or
      // unit/everyN/visitsPerCycle). Governed core field.
      f('visit_frequency', 'تكرار الزيارة', 'Visit Frequency'),
      f('latitude', 'خط العرض', 'Latitude', { type: 'number' }),
      f('longitude', 'خط الطول', 'Longitude', { type: 'number' }),
      f('allowed_gps_radius', 'نطاق GPS المسموح (متر)', 'Allowed GPS radius (m)', { type: 'number' }),
      // FMCG master-data FKs — governed core fields (DFG), importable by code via a
      // kind-filtered ref into the shared erp_customer_lookups (segment/classification/
      // channel) or erp_routes. Set on the customer form; resolved per tenant.
      f('classification_id', 'التصنيف', 'Classification', { type: 'ref', ref: { table: 'erp_customer_lookups', match: ['code'], column: 'classification_id', filter: { kind: 'classification' } } }),
      f('channel_id', 'القناة', 'Channel', { type: 'ref', ref: { table: 'erp_customer_lookups', match: ['code'], column: 'channel_id', filter: { kind: 'channel' } } }),
      f('segment_id', 'الشريحة', 'Segment', { type: 'ref', ref: { table: 'erp_customer_lookups', match: ['code'], column: 'segment_id', filter: { kind: 'segment' } } }),
      f('route_id', 'خط السير', 'Route', { type: 'ref', ref: { table: 'erp_routes', match: ['name'], column: 'route_id' } }),
      f('created_source', 'مصدر الإنشاء', 'Created source'),
      f('external_id', 'المعرّف الخارجي', 'External ID'),
    ],
  },
  {
    key: 'supplier', table: 'erp_suppliers', labelAr: 'الموردون', labelEn: 'Suppliers',
    permission: 'suppliers.manage', uniqueKey: 'external_id', dedupeKeys: ['external_id', 'code'],
    fields: [
      f('code', 'الكود', 'Code'),
      f('name', 'الاسم', 'Name', { required: true }),
      f('name_ar', 'الاسم بالعربية', 'Name (Arabic)'),
      f('phone', 'الهاتف', 'Phone'),
      f('email', 'البريد', 'Email', { type: 'email' }),
      f('external_id', 'المعرّف الخارجي', 'External ID'),
    ],
  },
  {
    key: 'product', table: 'erp_products_catalog', labelAr: 'المنتجات', labelEn: 'Products',
    permission: 'inventory.view', uniqueKey: 'external_id', dedupeKeys: ['external_id', 'code', 'barcode'],
    fields: [
      f('code', 'الكود', 'Code'),
      f('name', 'الاسم', 'Name', { required: true }),
      f('name_ar', 'الاسم بالعربية', 'Name (Arabic)'),
      f('barcode', 'الباركود', 'Barcode'),
      f('unit', 'الوحدة', 'Unit'),
      f('cost_price', 'سعر التكلفة', 'Cost', { type: 'number' }),
      f('sell_price', 'سعر البيع', 'Sell price', { type: 'number' }),
      f('brand', 'العلامة التجارية', 'Brand'),
      f('subcategory', 'الفئة الفرعية', 'Subcategory'),
      f('pack_size', 'حجم العبوة', 'Pack size'),
      f('expiry_days', 'مدة الصلاحية (يوم)', 'Expiry (days)', { type: 'number' }),
      f('external_id', 'المعرّف الخارجي', 'External ID'),
    ],
  },
  {
    key: 'branch', table: 'erp_branches', labelAr: 'الفروع', labelEn: 'Branches', permission: 'settings.branches',
    uniqueKey: 'external_id', dedupeKeys: ['external_id', 'code'],
    fields: [
      f('code', 'الكود', 'Code', { required: true }),
      f('name', 'الاسم', 'Name', { required: true }),
      f('name_ar', 'الاسم بالعربية', 'Name (Arabic)'),
      f('city', 'المدينة', 'City'),
      f('phone', 'الهاتف', 'Phone'),
      f('external_id', 'المعرّف الخارجي', 'External ID'),
    ],
  },
  { key: 'department', table: 'erp_departments', labelAr: 'الأقسام', labelEn: 'Departments', permission: 'settings.users' },
  {
    key: 'region', table: 'erp_regions', labelAr: 'المناطق', labelEn: 'Regions', permission: 'settings.branches',
    fields: [
      f('name', 'الاسم', 'Name', { required: true }),
      f('name_ar', 'الاسم بالعربية', 'Name (Arabic)'),
      f('external_id', 'المعرّف الخارجي', 'External ID'),
    ],
  },
  {
    key: 'area', table: 'erp_areas', labelAr: 'المناطق الفرعية', labelEn: 'Areas', permission: 'settings.branches',
    fields: [
      f('name', 'الاسم', 'Name', { required: true }),
      f('name_ar', 'الاسم بالعربية', 'Name (Arabic)'),
      f('external_id', 'المعرّف الخارجي', 'External ID'),
    ],
  },
  {
    key: 'route', table: 'erp_routes', labelAr: 'خطوط السير', labelEn: 'Routes', permission: 'route.create',
    uniqueKey: 'code', dedupeKeys: ['code'],
    fields: [
      f('code', 'الكود', 'Code', { required: true }),
      f('name', 'الاسم', 'Name', { required: true }),
      f('name_ar', 'الاسم بالعربية', 'Name (Arabic)'),
      f('city', 'المدينة', 'City'),
      f('status', 'الحالة', 'Status'),
      f('region_ref', 'مرجع المنطقة', 'Region (ref)', { type: 'ref' }),
      f('branch_ref', 'مرجع الفرع', 'Branch (ref)', { type: 'ref' }),
    ],
  },
  {
    key: 'journey_plan', table: 'erp_journey_plans', labelAr: 'خطط الزيارات', labelEn: 'Journey Plans', permission: 'journey.create',
    uniqueKey: 'external_id', dedupeKeys: ['customer_ref', 'day_of_week', 'sequence'],
    fields: [
      f('customer_ref', 'مرجع العميل (كود/معرّف)', 'Customer (code/ref)', { type: 'ref', required: true }),
      f('salesman_ref', 'مرجع المندوب (بريد/معرّف)', 'Salesman (email/ref)', { type: 'ref' }),
      f('day_of_week', 'يوم الأسبوع', 'Day of week', { required: true }),
      f('frequency', 'التكرار', 'Frequency'),
      f('sequence', 'الترتيب', 'Sequence', { type: 'number' }),
      f('external_id', 'المعرّف الخارجي', 'External ID'),
    ],
  },
  {
    key: 'user', table: 'erp_users', labelAr: 'المستخدمون', labelEn: 'Users', permission: 'user.import',
    uniqueKey: 'email', dedupeKeys: ['email'],
    fields: [
      f('full_name', 'الاسم الكامل', 'Full name', { required: true }),
      f('email', 'البريد', 'Email', { type: 'email', required: true }),
      f('phone', 'الهاتف', 'Phone'),
      f('role', 'الدور', 'Role'),
      f('branch_ref', 'مرجع الفرع', 'Branch (ref)', { type: 'ref' }),
      f('reports_to', 'يرفع إلى (بريد)', 'Reports to (email)', { type: 'email' }),
      f('active', 'نشط', 'Active', { type: 'boolean' }),
    ],
  },
  { key: 'invoice', table: 'erp_invoices', labelAr: 'الفواتير', labelEn: 'Invoices', permission: 'sales.sell' },
  { key: 'order', table: 'erp_sales_orders', labelAr: 'أوامر البيع', labelEn: 'Orders', permission: 'sales.sell' },
  { key: 'visit', table: 'erp_clinic_visits', labelAr: 'الزيارات/الكشوفات', labelEn: 'Visits' },
  { key: 'ticket', table: 'erp_salon_tickets', labelAr: 'التذاكر', labelEn: 'Tickets' },
  { key: 'purchase_return', table: 'erp_purchase_returns', labelAr: 'مرتجعات المشتريات', labelEn: 'Supplier Returns', permission: 'purchasing.return' },
  { key: 'product_serial', table: 'erp_product_serials', labelAr: 'الأرقام التسلسلية', labelEn: 'Product Serials', permission: 'inventory.view' },
  { key: 'warranty', table: 'erp_warranties', labelAr: 'الضمانات', labelEn: 'Warranties', permission: 'electrical.rma' },
  { key: 'rma', table: 'erp_rma', labelAr: 'طلبات الإرجاع', labelEn: 'RMA', permission: 'electrical.rma' },

  // ── Import Engine Extension — transactional / child entities (FK-resolved) ──
  // These tables back high-volume onboarding (invoice lines, collections, opening
  // stock, warehouses/vans, sales returns). Each references master data via a
  // `*_ref` field resolved to its FK before insert. `stamps` reflects the exact
  // audit columns each table has (verified against production) so inserts never
  // target a missing column. `dependsOn` drives the recommended import order.
  {
    key: 'warehouse', table: 'erp_warehouses', labelAr: 'المستودعات / العربات', labelEn: 'Warehouses / Vans',
    permission: 'integrations.manage', uniqueKey: 'code', dedupeKeys: ['code'],
    dependsOn: ['branch'], stamps: { updatedAt: true },
    fields: [
      f('branch_ref', 'مرجع الفرع (كود)', 'Branch (code)', { type: 'ref', required: true,
        ref: { table: 'erp_branches', match: ['code', 'external_id'], column: 'branch_id' } }),
      f('code', 'الكود', 'Code', { required: true }),
      f('name', 'الاسم', 'Name', { required: true }),
      f('name_ar', 'الاسم بالعربية', 'Name (Arabic)'),
      f('location', 'الموقع', 'Location'),
      f('is_van', 'عربة بيع', 'Is van', { type: 'boolean' }),
    ],
  },
  {
    key: 'stock', table: 'erp_inventory_stock', labelAr: 'الأرصدة الافتتاحية', labelEn: 'Opening Stock',
    permission: 'integrations.manage', dedupeKeys: ['warehouse_ref', 'product_ref'],
    dependsOn: ['warehouse', 'product'], stamps: { updatedAt: true },
    fields: [
      f('warehouse_ref', 'مرجع المستودع (كود)', 'Warehouse (code)', { type: 'ref', required: true,
        ref: { table: 'erp_warehouses', match: ['code'], column: 'warehouse_id' } }),
      f('product_ref', 'مرجع المنتج (كود/باركود)', 'Product (code/barcode)', { type: 'ref', required: true,
        ref: { table: 'erp_products_catalog', match: ['code', 'barcode', 'external_id'], column: 'product_id' } }),
      f('quantity', 'الكمية', 'Quantity', { type: 'number', required: true }),
      f('reserved_qty', 'الكمية المحجوزة', 'Reserved qty', { type: 'number' }),
    ],
  },
  {
    key: 'collection', table: 'erp_payments', labelAr: 'التحصيلات', labelEn: 'Collections',
    permission: 'integrations.manage', dedupeKeys: ['reference_number'],
    dependsOn: ['invoice'], stamps: {},
    fields: [
      f('invoice_ref', 'مرجع الفاتورة (رقم)', 'Invoice (number)', { type: 'ref', required: true,
        ref: { table: 'erp_invoices', match: ['invoice_number', 'external_id'], column: 'invoice_id' } }),
      f('amount', 'المبلغ', 'Amount', { type: 'number', required: true }),
      f('payment_method', 'طريقة الدفع', 'Payment method'),
      f('reference_number', 'الرقم المرجعي', 'Reference number'),
      f('payment_date', 'تاريخ الدفع', 'Payment date', { type: 'date' }),
      f('notes', 'ملاحظات', 'Notes'),
    ],
  },
  {
    key: 'sales_return', table: 'erp_sales_returns', labelAr: 'مرتجعات المبيعات', labelEn: 'Sales Returns',
    permission: 'integrations.manage', uniqueKey: 'return_number', dedupeKeys: ['return_number'],
    dependsOn: ['branch', 'customer', 'invoice'], stamps: { createdBy: true, updatedAt: true },
    fields: [
      f('return_number', 'رقم المرتجع', 'Return number', { required: true }),
      f('branch_ref', 'مرجع الفرع (كود)', 'Branch (code)', { type: 'ref', required: true,
        ref: { table: 'erp_branches', match: ['code', 'external_id'], column: 'branch_id' } }),
      f('customer_ref', 'مرجع العميل (كود)', 'Customer (code)', { type: 'ref', required: true,
        ref: { table: 'erp_customers', match: ['code', 'external_id'], column: 'customer_id' } }),
      f('invoice_ref', 'مرجع الفاتورة (رقم)', 'Invoice (number)', { type: 'ref',
        ref: { table: 'erp_invoices', match: ['invoice_number', 'external_id'], column: 'invoice_id' } }),
      f('total_amount', 'إجمالي المبلغ', 'Total amount', { type: 'number' }),
      f('reason', 'السبب', 'Reason'),
      f('status', 'الحالة', 'Status'),
      f('notes', 'ملاحظات', 'Notes'),
    ],
  },
  {
    key: 'invoice_line', table: 'erp_invoice_lines', labelAr: 'بنود الفواتير', labelEn: 'Invoice Lines',
    permission: 'integrations.manage', dedupeKeys: ['invoice_ref', 'product_ref'],
    dependsOn: ['invoice', 'product'], stamps: {},
    fields: [
      f('invoice_ref', 'مرجع الفاتورة (رقم)', 'Invoice (number)', { type: 'ref', required: true,
        ref: { table: 'erp_invoices', match: ['invoice_number', 'external_id'], column: 'invoice_id' } }),
      f('product_ref', 'مرجع المنتج (كود/باركود)', 'Product (code/barcode)', { type: 'ref', required: true,
        ref: { table: 'erp_products_catalog', match: ['code', 'barcode', 'external_id'], column: 'product_id' } }),
      f('quantity', 'الكمية', 'Quantity', { type: 'number', required: true }),
      f('unit_price', 'سعر الوحدة', 'Unit price', { type: 'number', required: true }),
      f('discount_pct', 'نسبة الخصم %', 'Discount %', { type: 'number' }),
      f('line_total', 'إجمالي البند', 'Line total', { type: 'number' }),
    ],
  },
];

const BY_KEY = new Map(REGISTRY.map((e) => [e.key, e]));

export function listEntities(): EntityDescriptor[] {
  return REGISTRY;
}
/** Entities that can be imported (have a field map + importable capability). */
export function listImportableEntities(): EntityDescriptor[] {
  return REGISTRY.filter((e) => e.fields && e.fields.length > 0 && entityCapabilities(e.key).importable);
}
/** Entities that can be exported (have a field map + exportable capability).
 *  The descriptor's `fields` are the exported columns — same business-facing
 *  shape as import, so an export round-trips back through the Import Engine. */
export function listExportableEntities(): EntityDescriptor[] {
  return REGISTRY.filter((e) => e.fields && e.fields.length > 0 && entityCapabilities(e.key).exportable);
}
export function getEntity(key: string): EntityDescriptor | undefined {
  return BY_KEY.get(key);
}
/** Resolve an entity's effective capabilities (defaults ON, with overrides). */
export function entityCapabilities(key: string): EntityCapabilities {
  const e = BY_KEY.get(key);
  return { ...ALL_ON, ...(e?.capabilities ?? {}) };
}
/** Whether a free-form entity key is a known, registered entity. */
export function isKnownEntity(key: string): boolean {
  return BY_KEY.has(key);
}

/** The field that uniquely identifies a record for update/upsert. Defaults to
 *  'external_id' when the entity has that field, else the first required field. */
export function entityUniqueKey(e: EntityDescriptor): string | null {
  if (e.uniqueKey) return e.uniqueKey;
  if (e.fields?.some((f) => f.key === 'external_id')) return 'external_id';
  return e.fields?.find((f) => f.required)?.key ?? null;
}

/** Field keys used to detect duplicates (within file + against existing rows). */
export function entityDedupeKeys(e: EntityDescriptor): string[] {
  if (e.dedupeKeys && e.dedupeKeys.length) return e.dedupeKeys;
  const uk = entityUniqueKey(e);
  return uk ? [uk] : [];
}

/** The entity's foreign-key (`ref`) fields that the engine resolves before insert.
 *  Only fields that declare BOTH `type:'ref'` and a `ref` spec are returned; a
 *  `type:'ref'` field without a spec is treated as plain text (legacy behaviour). */
export function entityRefFields(e: EntityDescriptor): RefFieldDef[] {
  return (e.fields ?? [])
    .filter((f): f is EntityField & { ref: RefSpec } => f.type === 'ref' && !!f.ref)
    .map((f) => ({ key: f.key, labelEn: f.labelEn, required: f.required, ref: f.ref }));
}

/** Resolve the audit/stamp columns an entity supports. Legacy entities (no
 *  `stamps`) get the master-data default (all true); entities that declare
 *  `stamps` get exactly what they declare (unspecified → false). */
export function entityStamps(e: EntityDescriptor): Required<EntityStamps> {
  if (!e.stamps) return { importJobId: true, createdBy: true, updatedBy: true, updatedAt: true, custom: true };
  const s = e.stamps;
  return {
    importJobId: !!s.importJobId, createdBy: !!s.createdBy, updatedBy: !!s.updatedBy,
    updatedAt: !!s.updatedAt, custom: !!s.custom,
  };
}

/** Recommend an import order for a set of entity keys: parents (dependencies)
 *  before children, via a stable topological sort over `dependsOn`. Unknown or
 *  out-of-set dependencies are ignored; cycles fall back to input order. */
export function orderEntitiesByDependency(keys: string[]): string[] {
  const inSet = new Set(keys);
  const visited = new Set<string>();
  const result: string[] = [];
  const visit = (key: string, stack: Set<string>) => {
    if (visited.has(key) || stack.has(key)) return; // cycle guard
    stack.add(key);
    const deps = getEntity(key)?.dependsOn ?? [];
    for (const d of deps) if (inSet.has(d)) visit(d, stack);
    stack.delete(key);
    if (!visited.has(key)) { visited.add(key); result.push(key); }
  };
  for (const k of keys) visit(k, new Set());
  return result;
}
