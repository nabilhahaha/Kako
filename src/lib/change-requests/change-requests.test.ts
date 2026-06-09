import { describe, it, expect } from 'vitest';
import {
  CHANGE_REQUESTS_ENABLED,
  CR_APPLY_ALLOWLIST,
  isApplyAllowed,
  resolveWorkflowKey,
  parseEntityRow,
  pickEntityRow,
  registerValidator,
  getValidator,
  registerApprovalAdapter,
  getApprovalAdapter,
} from './index';
import type { ChangeRequestEntityRow } from './types';

describe('change-requests/flags', () => {
  it('defaults OFF; on for "1"/"true"', () => {
    const prev = process.env.KAKO_CHANGE_REQUESTS;
    delete process.env.KAKO_CHANGE_REQUESTS;
    expect(CHANGE_REQUESTS_ENABLED()).toBe(false);
    process.env.KAKO_CHANGE_REQUESTS = '1';
    expect(CHANGE_REQUESTS_ENABLED()).toBe(true);
    process.env.KAKO_CHANGE_REQUESTS = 'true';
    expect(CHANGE_REQUESTS_ENABLED()).toBe(true);
    process.env.KAKO_CHANGE_REQUESTS = 'no';
    expect(CHANGE_REQUESTS_ENABLED()).toBe(false);
    if (prev === undefined) delete process.env.KAKO_CHANGE_REQUESTS; else process.env.KAKO_CHANGE_REQUESTS = prev;
  });
});

describe('change-requests/apply allowlist', () => {
  it('only allowlisted tables are valid apply targets', () => {
    expect(isApplyAllowed('erp_customers')).toBe(true);
    expect(isApplyAllowed('erp_products_catalog')).toBe(true);
    expect(isApplyAllowed('erp_suppliers')).toBe(true);
    expect(isApplyAllowed('erp_routes')).toBe(true);
    expect(isApplyAllowed('erp_invoices')).toBe(false);
    expect(isApplyAllowed('auth.users')).toBe(false);
    expect(isApplyAllowed('')).toBe(false);
    expect(CR_APPLY_ALLOWLIST.has('erp_customers')).toBe(true);
  });
});

describe('change-requests/resolveWorkflowKey', () => {
  it('defaults to change_request:{entity}; honors explicit', () => {
    expect(resolveWorkflowKey('customer', null)).toBe('change_request:customer');
    expect(resolveWorkflowKey('customer', '  ')).toBe('change_request:customer');
    expect(resolveWorkflowKey('customer', 'custom_flow')).toBe('custom_flow');
  });
});

const baseRow = (over: Partial<ChangeRequestEntityRow> = {}): ChangeRequestEntityRow => ({
  company_id: null,
  entity_key: 'customer',
  target_table: 'erp_customers',
  id_column: null,
  label_en: 'Customer',
  label_ar: 'عميل',
  create_permission: 'customers.manage',
  approve_permission: 'customers.approve',
  workflow_key: null,
  allowed_fields: null,
  validation: {},
  attachment_types: [],
  supports_effective_dating: null,
  supports_bulk: null,
  bulk_max: null,
  notification_template: null,
  is_active: null,
  ...over,
});

describe('change-requests/parseEntityRow', () => {
  it('maps snake→camel and applies safe defaults', () => {
    const e = parseEntityRow(baseRow());
    expect(e).toMatchObject({
      entityKey: 'customer',
      targetTable: 'erp_customers',
      idColumn: 'id',                       // defaulted
      workflowKey: 'change_request:customer', // defaulted
      allowedFields: null,                  // null = DFG governs
      supportsEffectiveDating: true,
      supportsBulk: true,
      bulkMax: 1000,
      isActive: true,
      companyId: null,
    });
  });

  it('coerces jsonb arrays/objects and honors explicit values', () => {
    const e = parseEntityRow(baseRow({
      id_column: 'uuid',
      workflow_key: 'wf_x',
      allowed_fields: ['vat_number', 'cr_number', 42],   // non-strings dropped
      attachment_types: ['vat_certificate', 'cr_copy'],
      validation: { rules: [{ field: 'vat_number', required: true }] },
      supports_bulk: false,
      bulk_max: 50,
      is_active: false,
      company_id: 'c1',
    }));
    expect(e.idColumn).toBe('uuid');
    expect(e.workflowKey).toBe('wf_x');
    expect(e.allowedFields).toEqual(['vat_number', 'cr_number']);
    expect(e.attachmentTypes).toEqual(['vat_certificate', 'cr_copy']);
    expect(e.validation.rules?.[0]).toEqual({ field: 'vat_number', required: true });
    expect(e.supportsBulk).toBe(false);
    expect(e.bulkMax).toBe(50);
    expect(e.isActive).toBe(false);
    expect(e.companyId).toBe('c1');
  });

  it('ignores malformed validation jsonb', () => {
    expect(parseEntityRow(baseRow({ validation: 'oops' })).validation).toEqual({});
    expect(parseEntityRow(baseRow({ validation: { rules: 'no' } })).validation).toEqual({});
  });
});

describe('change-requests/pickEntityRow', () => {
  const rows = [
    { company_id: null, k: 'global' },
    { company_id: 'c1', k: 'company' },
  ];
  it('prefers the company row, falls back to global', () => {
    expect(pickEntityRow(rows, 'c1')?.k).toBe('company');
    expect(pickEntityRow(rows, 'c2')?.k).toBe('global');   // no c2 override → global
    expect(pickEntityRow(rows, null)?.k).toBe('global');
    expect(pickEntityRow([{ company_id: 'c1', k: 'only' }], null)).toBeNull(); // no global, no match
  });
});

describe('change-requests/code registries', () => {
  it('named validators round-trip; unknown → undefined', () => {
    expect(getValidator('nope')).toBeUndefined();
    const fn = (v: unknown) => (typeof v === 'string' && v.length ? null : 'empty');
    registerValidator('non_empty', fn);
    expect(getValidator('non_empty')).toBe(fn);
    expect(getValidator('non_empty')!('x', { field: 'f', entityKey: 'e' })).toBeNull();
    expect(getValidator('non_empty')!('', { field: 'f', entityKey: 'e' })).toBe('empty');
  });

  it('approval adapters round-trip', () => {
    expect(getApprovalAdapter('nope')).toBeUndefined();
    const adapter = { dispatch: async () => {} };
    registerApprovalAdapter('email', adapter);
    expect(getApprovalAdapter('email')).toBe(adapter);
  });
});
