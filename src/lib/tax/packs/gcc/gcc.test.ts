import { describe, it, expect } from 'vitest';
import { buildFtaInvoice, validateFtaInvoice, UAE_FTA_PACK, BAHRAIN_NBR_PACK, OMAN_OTA_PACK, KUWAIT_PACK, GCC_PACKS, registerGccPacks } from './index';
import { TaxPackRegistry } from '../registry';

const ftaInput = {
  invoiceNumber: 'AE-1', issueDate: '2026-06-08', sellerTrn: '100000000000003',
  lines: [{ description: 'A', quantity: 2, unitPrice: 100 }, { description: 'Export', quantity: 1, unitPrice: 500, zeroRated: true }],
};

describe('GCC packs (5E)', () => {
  it('UAE FTA: 5% standard + zero-rated line', () => {
    const inv = buildFtaInvoice(ftaInput);
    expect(inv.netAmount).toBe(700);
    expect(inv.vatTotal).toBe(10);      // 200*5% = 10; export zero-rated = 0
    expect(inv.totalAmount).toBe(710);
    expect(inv.lines[1].vat).toBe(0);
  });

  it('UAE FTA validates a 15-digit TRN', () => {
    expect(validateFtaInvoice(ftaInput)).toEqual([]);
    expect(validateFtaInvoice({ ...ftaInput, sellerTrn: 'bad' }).map((i) => i.field)).toContain('sellerTrn');
  });

  it('declares GCC pack descriptors (UAE/Bahrain/Oman/Kuwait)', () => {
    expect(UAE_FTA_PACK).toMatchObject({ country: 'AE', regime: 'fta' });
    expect(BAHRAIN_NBR_PACK).toMatchObject({ country: 'BH', regime: 'nbr' });
    expect(OMAN_OTA_PACK).toMatchObject({ country: 'OM', regime: 'ota' });
    expect(KUWAIT_PACK).toMatchObject({ country: 'KW' });
    expect(GCC_PACKS).toHaveLength(4);
  });

  it('registers all GCC packs and resolves them by country', () => {
    const reg = new TaxPackRegistry();
    registerGccPacks(reg);
    expect(reg.resolve('AE', 'fta')!.id).toBe('fta-1.0');
    expect(reg.resolve('BH', 'nbr')!.id).toBe('nbr-1.0');
    expect(reg.resolve('OM', 'ota')!.id).toBe('ota-1.0');
    expect(reg.resolve('KW', 'kw')!.id).toBe('kw-0.1');
  });
});
