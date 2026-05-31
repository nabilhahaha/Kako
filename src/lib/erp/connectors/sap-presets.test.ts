import { describe, it, expect } from 'vitest';
import { SAP_FILE_PRESETS, sapFilePreset, sapFileFieldMap } from './sap-presets';
import { mapRecord } from './runtime/generic-rest-runtime';

describe('SAP file presets (B3b)', () => {
  it('ships the confirmed first-entity presets (DEBMAS/CREMAS/MATMAS in; ORDERS/INVOIC out)', () => {
    expect(SAP_FILE_PRESETS.map((p) => p.key).sort()).toEqual([
      'sap_cremas_supplier', 'sap_debmas_customer', 'sap_invoic_out', 'sap_matmas_product', 'sap_orders_out',
    ]);
  });

  it('resolves a preset by entity + direction', () => {
    expect(sapFilePreset('customer', 'in')?.idoc).toBe('DEBMAS');
    expect(sapFilePreset('supplier', 'in')?.idoc).toBe('CREMAS');
    expect(sapFilePreset('product', 'in')?.idoc).toBe('MATMAS');
    expect(sapFilePreset('order', 'out')?.idoc).toBe('ORDERS');
    expect(sapFilePreset('invoice', 'out')?.idoc).toBe('INVOIC');
    expect(sapFilePreset('customer', 'out')).toBeUndefined();
    expect(sapFilePreset('unknown', 'in')).toBeUndefined();
  });

  it('inbound DEBMAS map turns SAP columns into VANTORA customer fields', () => {
    const map = sapFileFieldMap('customer', 'in')!;
    const sapRow = { KUNNR: 'C-100', NAME1: 'Cairo Trading', TELF1: '0100', SMTP_ADDR: 'a@b.co', ORT01: 'Cairo', IGNORED: 'x' };
    expect(mapRecord(sapRow, map)).toEqual({
      external_id: 'C-100', name: 'Cairo Trading', phone: '0100', email: 'a@b.co', city: 'Cairo',
    });
  });

  it('inbound MATMAS map → product external_id/name/barcode/unit', () => {
    const map = sapFileFieldMap('product', 'in')!;
    expect(mapRecord({ MATNR: 'M-1', MAKTX: 'Widget', EAN11: '6221', MEINS: 'EA' }, map)).toEqual({
      external_id: 'M-1', name: 'Widget', barcode: '6221', unit: 'EA',
    });
  });

  it('outbound ORDERS map turns VANTORA fields into SAP columns', () => {
    const map = sapFileFieldMap('order', 'out')!;
    expect(mapRecord({ external_id: 'SO-9', code: 'PO-7', updated_at: 't' }, map)).toEqual({
      BELNR: 'SO-9', BSTKD: 'PO-7',
    });
  });

  it('every preset maps in the documented direction (in: SAP→VANTORA, out: VANTORA→SAP)', () => {
    for (const p of SAP_FILE_PRESETS) {
      expect(Object.keys(p.fieldMap).length).toBeGreaterThan(0);
      // inbound destinations are lower_snake VANTORA fields; outbound destinations are UPPER SAP cols.
      const dests = Object.values(p.fieldMap);
      if (p.direction === 'in') expect(dests.every((d) => d === d.toLowerCase())).toBe(true);
      else expect(dests.every((d) => d === d.toUpperCase())).toBe(true);
    }
  });
});
