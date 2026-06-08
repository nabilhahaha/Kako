import { describe, it, expect } from 'vitest';
import {
  TaxPackRegistry, packSupports, canHandleComplianceClass, capabilityForComplianceClass,
  type TaxCompliancePack,
} from './registry';

const zatca = (version: string, effectiveFrom?: string): TaxCompliancePack => ({
  id: `zatca-${version}`, country: 'SA', regime: 'zatca', version,
  capabilities: ['e_invoice', 'simplified', 'clearance', 'reporting', 'qr', 'digital_signature', 'credit_note', 'debit_note'],
  effectiveFrom,
});
const eta: TaxCompliancePack = { id: 'eta-1', country: 'EG', regime: 'eta', version: '1.0.0', capabilities: ['e_invoice', 'e_receipt', 'credit_note', 'debit_note', 'digital_signature'] };

describe('country pack framework registry', () => {
  it('resolves a pack by country + regime', () => {
    const reg = new TaxPackRegistry();
    reg.register(zatca('2.0.0'));
    reg.register(eta);
    expect(reg.resolve('SA', 'zatca')!.id).toBe('zatca-2.0.0');
    expect(reg.resolve('EG', 'eta')!.id).toBe('eta-1');
    expect(reg.resolve('AE', 'fta')).toBeUndefined();
  });

  it('picks the highest semver version', () => {
    const reg = new TaxPackRegistry();
    reg.register(zatca('2.3.0'));
    reg.register(zatca('2.10.0'));
    reg.register(zatca('2.2.5'));
    expect(reg.resolve('SA', 'zatca')!.version).toBe('2.10.0');
  });

  it('respects effective dates (as-of resolution / mandate date)', () => {
    const reg = new TaxPackRegistry();
    reg.register(zatca('2.0.0', '2024-01-01'));
    reg.register(zatca('3.0.0', '2026-07-01')); // future mandate
    expect(reg.resolve('SA', 'zatca', '2026-06-08')!.version).toBe('2.0.0');
    expect(reg.resolve('SA', 'zatca', '2026-08-01')!.version).toBe('3.0.0');
  });

  it('maps compliance class → capability and negotiates support', () => {
    expect(capabilityForComplianceClass('e_invoice')).toBe('e_invoice');
    expect(capabilityForComplianceClass('none')).toBeNull();
    expect(packSupports(eta, 'e_receipt')).toBe(true);
    expect(packSupports(eta, 'clearance')).toBe(false);
    expect(canHandleComplianceClass(eta, 'e_receipt')).toBe(true);
    expect(canHandleComplianceClass(eta, 'none')).toBe(true);
    expect(canHandleComplianceClass(eta, 'simplified')).toBe(false); // ETA stub has no 'simplified'
  });
});
