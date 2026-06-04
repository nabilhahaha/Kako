import { describe, it, expect } from 'vitest';
import { NETSUITE_PRESETS, netsuitePreset } from './netsuite-presets';
import { mapRecord } from './runtime/generic-rest-runtime';

describe('NetSuite presets (B4)', () => {
  it('ships the confirmed first-entity presets', () => {
    expect(NETSUITE_PRESETS.map((p) => p.key).sort()).toEqual([
      'ns_customer', 'ns_inventory_item', 'ns_invoice_out', 'ns_sales_order_out', 'ns_vendor_supplier',
    ]);
  });

  it('resolves by entity + direction with the right record types', () => {
    expect(netsuitePreset('customer', 'in')?.recordType).toBe('customer');
    expect(netsuitePreset('supplier', 'in')?.recordType).toBe('vendor');
    expect(netsuitePreset('product', 'in')?.recordType).toBe('inventoryItem');
    expect(netsuitePreset('order', 'out')?.recordType).toBe('salesOrder');
    expect(netsuitePreset('invoice', 'out')?.recordType).toBe('invoice');
    expect(netsuitePreset('customer', 'out')).toBeUndefined();
  });

  it('inbound customer map turns NetSuite fields into VANTORA customer fields', () => {
    const map = netsuitePreset('customer', 'in')!.fieldMap;
    expect(mapRecord({ id: '7', entityId: 'CUST7', companyName: 'Acme', phone: '01', email: 'a@b.co', x: 1 }, map)).toEqual({
      external_id: '7', code: 'CUST7', name: 'Acme', phone: '01', email: 'a@b.co',
    });
  });

  it('outbound salesOrder map turns VANTORA fields into NetSuite fields', () => {
    const map = netsuitePreset('order', 'out')!.fieldMap;
    expect(mapRecord({ external_id: 'SO-9', code: 'T-9', updated_at: 't' }, map)).toEqual({
      externalId: 'SO-9', tranId: 'T-9',
    });
  });
});
