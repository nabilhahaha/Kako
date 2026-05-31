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
  { key: 'invoice', table: 'erp_invoices', labelAr: 'الفواتير', labelEn: 'Invoices', permission: 'sales.sell' },
  { key: 'order', table: 'erp_sales_orders', labelAr: 'أوامر البيع', labelEn: 'Orders', permission: 'sales.sell' },
  { key: 'visit', table: 'erp_clinic_visits', labelAr: 'الزيارات/الكشوفات', labelEn: 'Visits' },
  { key: 'ticket', table: 'erp_salon_tickets', labelAr: 'التذاكر', labelEn: 'Tickets' },
];

const BY_KEY = new Map(REGISTRY.map((e) => [e.key, e]));

export function listEntities(): EntityDescriptor[] {
  return REGISTRY;
}
/** Entities that can be imported (have a field map + importable capability). */
export function listImportableEntities(): EntityDescriptor[] {
  return REGISTRY.filter((e) => e.fields && e.fields.length > 0 && entityCapabilities(e.key).importable);
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
