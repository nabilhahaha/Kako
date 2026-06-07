// ============================================================================
// Search OS — provider registry (V1). ONE provider per entity: the single place
// that knows a source table's columns and how to project a row into the unified
// index (erp_search_documents). Pure + unit-testable. Reuse-over-rebuild: the SQL
// and the query service stay entity-neutral; only this file changes per entity.
// ============================================================================

import type { SearchEntityType } from './types';
import { normCode, normIdentifier, buildIdentifiers, phoneVariants } from './classify';

/** A projected document (company_id is resolved by the backfill: directly from
 *  `companyIdRaw` for column-scoped entities, or via the branch→company map). */
export interface ProjectedDoc {
  entityId: string;
  title: string;
  subtitle: string | null;
  body: string | null;
  identifiers: string[];
  href: string;
  metadata: Record<string, unknown>;
  branchId: string | null;
  companyIdRaw: string | null;
}

export interface SearchProvider {
  entityType: SearchEntityType;
  table: string;
  /** Reused capability key (decision 3); null = RLS-only (tenant scope still applies). */
  permissionKey: string | null;
  /** company_id source: 'column' = row.company_id; 'branch' = resolve via branch map. */
  companyVia: 'column' | 'branch';
  /** Columns to read during backfill (defensive — extra columns ignored). */
  select: string;
  /** Whether V1 backfills this entity now (false = registered, populated later). */
  backfill: boolean;
  toDocument(row: Record<string, unknown>): ProjectedDoc;
}

const s = (v: unknown): string => (v == null ? '' : String(v));
const nameOf = (row: Record<string, unknown>) => s(row.name) || s(row.name_ar) || s(row.name_en) || '';

export const SEARCH_PROVIDERS: Record<SearchEntityType, SearchProvider> = {
  customer: {
    entityType: 'customer', table: 'erp_customers', permissionKey: 'customers.view', companyVia: 'column',
    select: 'id,code,name,name_ar,phone,tax_number,city,is_active,company_id,branch_id',
    backfill: true,
    toDocument: (r) => ({
      entityId: s(r.id), title: nameOf(r) || s(r.code), subtitle: [s(r.code), s(r.city)].filter(Boolean).join(' · ') || null,
      body: s(r.name_ar) || null,
      identifiers: buildIdentifiers([normCode(r.code), ...phoneVariants(r.phone), normIdentifier(r.tax_number)]),
      href: `/customers/${s(r.id)}`, metadata: { code: r.code ?? null, city: r.city ?? null, is_active: r.is_active ?? null },
      branchId: (r.branch_id as string) ?? null, companyIdRaw: (r.company_id as string) ?? null,
    }),
  },
  product: {
    entityType: 'product', table: 'erp_products_catalog', permissionKey: 'inventory.view', companyVia: 'column',
    select: 'id,code,name,name_ar,barcode,unit,sell_price,is_active,company_id',
    backfill: true,
    toDocument: (r) => ({
      entityId: s(r.id), title: nameOf(r) || s(r.code), subtitle: [s(r.code), s(r.unit)].filter(Boolean).join(' · ') || null,
      body: s(r.name_ar) || null,
      identifiers: buildIdentifiers([normCode(r.code), normIdentifier(r.barcode)]),
      href: `/products?focus=${s(r.id)}`, metadata: { code: r.code ?? null, barcode: r.barcode ?? null, sell_price: r.sell_price ?? null },
      branchId: null, companyIdRaw: (r.company_id as string) ?? null,
    }),
  },
  supplier: {
    entityType: 'supplier', table: 'erp_suppliers', permissionKey: 'suppliers.view', companyVia: 'column',
    select: 'id,code,name,name_ar,phone,tax_number,city,is_active,company_id',
    backfill: true,
    toDocument: (r) => ({
      entityId: s(r.id), title: nameOf(r) || s(r.code), subtitle: [s(r.code), s(r.city)].filter(Boolean).join(' · ') || null,
      body: s(r.name_ar) || null,
      identifiers: buildIdentifiers([normCode(r.code), ...phoneVariants(r.phone), normIdentifier(r.tax_number)]),
      href: `/suppliers/${s(r.id)}`, metadata: { code: r.code ?? null, city: r.city ?? null },
      branchId: null, companyIdRaw: (r.company_id as string) ?? null,
    }),
  },
  order: {
    entityType: 'order', table: 'erp_sales_orders', permissionKey: null, companyVia: 'branch',
    select: 'id,order_number,status,net_amount,branch_id',
    backfill: true,
    toDocument: (r) => ({
      entityId: s(r.id), title: s(r.order_number) || s(r.id), subtitle: s(r.status) || null, body: null,
      identifiers: buildIdentifiers([normCode(r.order_number)]),
      href: `/sales/orders?focus=${s(r.id)}`, metadata: { status: r.status ?? null, net_amount: r.net_amount ?? null },
      branchId: (r.branch_id as string) ?? null, companyIdRaw: null,
    }),
  },
  invoice: {
    entityType: 'invoice', table: 'erp_invoices', permissionKey: 'accounting.view', companyVia: 'branch',
    select: 'id,invoice_number,status,net_amount,due_date,branch_id',
    backfill: true,
    toDocument: (r) => ({
      entityId: s(r.id), title: s(r.invoice_number) || s(r.id), subtitle: s(r.status) || null, body: null,
      identifiers: buildIdentifiers([normCode(r.invoice_number)]),
      href: `/sales/invoices?focus=${s(r.id)}`, metadata: { status: r.status ?? null, net_amount: r.net_amount ?? null, due_date: r.due_date ?? null },
      branchId: (r.branch_id as string) ?? null, companyIdRaw: null,
    }),
  },
  return: {
    entityType: 'return', table: 'erp_sales_returns', permissionKey: 'accounting.view', companyVia: 'branch',
    select: 'id,return_number,status,branch_id',
    backfill: true,
    toDocument: (r) => ({
      entityId: s(r.id), title: s(r.return_number) || s(r.id), subtitle: s(r.status) || null, body: null,
      identifiers: buildIdentifiers([normCode(r.return_number)]),
      href: `/sales/returns?focus=${s(r.id)}`, metadata: { status: r.status ?? null },
      branchId: (r.branch_id as string) ?? null, companyIdRaw: null,
    }),
  },
  visit: {
    entityType: 'visit', table: 'erp_visits', permissionKey: null, companyVia: 'branch',
    select: 'id,visit_date,notes,branch_id',
    backfill: true,
    toDocument: (r) => ({
      entityId: s(r.id), title: s(r.visit_date) ? `Visit ${s(r.visit_date)}` : `Visit ${s(r.id)}`, subtitle: s(r.notes) || null,
      body: s(r.notes) || null, identifiers: [],
      href: `/visits?focus=${s(r.id)}`, metadata: { visit_date: r.visit_date ?? null },
      branchId: (r.branch_id as string) ?? null, companyIdRaw: null,
    }),
  },
  workflow: {
    entityType: 'workflow', table: 'erp_workflow_definitions', permissionKey: 'workflow.manage', companyVia: 'column',
    select: 'id,key,entity,name_ar,name_en,is_active,company_id',
    backfill: true,
    toDocument: (r) => ({
      entityId: s(r.id), title: nameOf(r) || s(r.key), subtitle: [s(r.key), s(r.entity)].filter(Boolean).join(' · ') || null,
      body: null, identifiers: buildIdentifiers([normCode(r.key)]),
      href: `/settings/workflows`, metadata: { key: r.key ?? null, entity: r.entity ?? null, is_active: r.is_active ?? null },
      branchId: null, companyIdRaw: (r.company_id as string) ?? null,
    }),
  },
  // ── Registered, backfill DEFERRED in this turn (need parent-route map / member source) ──
  attachment: {
    entityType: 'attachment', table: 'erp_entity_attachments', permissionKey: null, companyVia: 'column',
    select: 'id,file_name,entity,record_id,company_id',
    backfill: false,
    toDocument: (r) => ({
      entityId: s(r.id), title: s(r.file_name) || s(r.id), subtitle: s(r.entity) || null, body: null,
      identifiers: buildIdentifiers([normCode(r.file_name)]),
      href: `/attachments?focus=${s(r.id)}`, metadata: { entity: r.entity ?? null, record_id: r.record_id ?? null },
      branchId: null, companyIdRaw: (r.company_id as string) ?? null,
    }),
  },
  user: {
    entityType: 'user', table: 'erp_profiles', permissionKey: null, companyVia: 'column',
    select: 'id,full_name,email,phone',
    backfill: false,
    toDocument: (r) => ({
      entityId: s(r.id), title: s(r.full_name) || s(r.email) || s(r.id), subtitle: s(r.email) || null, body: null,
      identifiers: buildIdentifiers([normIdentifier(r.email), ...phoneVariants(r.phone)]),
      href: `/settings/staff?focus=${s(r.id)}`, metadata: { email: r.email ?? null },
      branchId: null, companyIdRaw: null,
    }),
  },
};

/** Entities backfilled in V1 (this turn). */
export const BACKFILL_PROVIDERS = (Object.values(SEARCH_PROVIDERS) as SearchProvider[]).filter((p) => p.backfill);
