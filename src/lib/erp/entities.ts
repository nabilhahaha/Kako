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
}

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
    permission: 'customers.manage',
    fields: [
      f('code', 'الكود', 'Code'),
      f('name', 'الاسم', 'Name', { required: true }),
      f('phone', 'الهاتف', 'Phone'),
      f('email', 'البريد', 'Email', { type: 'email' }),
      f('credit_limit', 'حد الائتمان', 'Credit limit', { type: 'number' }),
    ],
  },
  {
    key: 'supplier', table: 'erp_suppliers', labelAr: 'الموردون', labelEn: 'Suppliers',
    permission: 'suppliers.manage',
    fields: [
      f('code', 'الكود', 'Code'),
      f('name', 'الاسم', 'Name', { required: true }),
      f('phone', 'الهاتف', 'Phone'),
      f('email', 'البريد', 'Email', { type: 'email' }),
    ],
  },
  {
    key: 'product', table: 'erp_products_catalog', labelAr: 'المنتجات', labelEn: 'Products',
    fields: [
      f('code', 'الكود', 'Code'),
      f('name', 'الاسم', 'Name', { required: true }),
      f('barcode', 'الباركود', 'Barcode'),
      f('cost_price', 'سعر التكلفة', 'Cost', { type: 'number' }),
      f('sell_price', 'سعر البيع', 'Sell price', { type: 'number' }),
    ],
  },
  { key: 'employee', table: 'erp_user_branches', labelAr: 'الموظفون', labelEn: 'Employees', permission: 'settings.users' },
  { key: 'branch', table: 'erp_branches', labelAr: 'الفروع', labelEn: 'Branches', permission: 'settings.branches' },
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
