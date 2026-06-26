import { describe, it, expect } from 'vitest';
import { DEFAULT_PRINT_SETTINGS, normalizePrintSettings, receiptQuery } from './print-settings';

describe('print-settings', () => {
  it('defaults to auto-print, 80mm, logo/qr/cashier on', () => {
    expect(DEFAULT_PRINT_SETTINGS).toEqual({ autoPrint: true, paperWidth: '80', showLogo: true, showQr: true, showCashier: true });
  });

  it('normalizes a partial/corrupt object back to a valid shape', () => {
    expect(normalizePrintSettings({ paperWidth: '58', showQr: false })).toEqual({
      autoPrint: true, paperWidth: '58', showLogo: true, showQr: false, showCashier: true,
    });
    // bad paperWidth → 80; non-boolean → default
    expect(normalizePrintSettings({ paperWidth: 'A4' as never, autoPrint: 'yes' as never }).paperWidth).toBe('80');
    expect(normalizePrintSettings(null)).toEqual(DEFAULT_PRINT_SETTINGS);
  });

  it('builds a receipt query reflecting the settings + cash received/change', () => {
    const q = receiptQuery({ autoPrint: true, paperWidth: '58', showLogo: false, showQr: true, showCashier: false }, { received: 120, change: 17.65 });
    const p = new URLSearchParams(q);
    expect(p.get('autoprint')).toBe('1');
    expect(p.get('w')).toBe('58');
    expect(p.get('logo')).toBe('0');
    expect(p.get('qr')).toBe('1');
    expect(p.get('cashier')).toBe('0');
    expect(p.get('recv')).toBe('120');
    expect(p.get('chg')).toBe('17.65');
  });

  it('omits received/change when not provided, and can suppress autoprint (reprint preview)', () => {
    const q = receiptQuery(DEFAULT_PRINT_SETTINGS, { autoprint: false });
    const p = new URLSearchParams(q);
    expect(p.has('recv')).toBe(false);
    expect(p.has('chg')).toBe(false);
    expect(p.has('autoprint')).toBe(false);
  });
});
