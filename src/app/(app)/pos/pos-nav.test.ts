import { describe, it, expect } from 'vitest';
import { posNavItems, posBackOfficeItem } from './pos-nav';

describe('posNavItems — cashier sees only POS-relevant navigation', () => {
  it('a cashier gets exactly Point of Sale, Orders, Shift Summary (no setup/reports)', () => {
    const items = posNavItems({ isManager: false });
    expect(items.map((i) => i.key)).toEqual(['pos', 'orders', 'shift']);
  });

  it('a cashier never sees Setup, Reports, or a back-office escape', () => {
    const keys = posNavItems({ isManager: false }).map((i) => i.key);
    expect(keys).not.toContain('setup');
    expect(keys).not.toContain('reports');
    expect(keys).not.toContain('backoffice');
    expect(posBackOfficeItem({ isManager: false })).toBeNull();
  });

  it('every cashier item points only at a /pos route (no ERP leakage)', () => {
    for (const i of posNavItems({ isManager: false })) {
      expect(i.href === '/pos' || i.href.startsWith('/pos/')).toBe(true);
    }
  });

  it('a manager additionally sees Reports and Setup', () => {
    const keys = posNavItems({ isManager: true }).map((i) => i.key);
    expect(keys).toContain('reports');
    expect(keys).toContain('setup');
    // still includes the core sell-first items
    expect(keys).toEqual(expect.arrayContaining(['pos', 'orders', 'shift']));
  });

  it('a manager gets a back-office escape hatch to the full ERP', () => {
    const back = posBackOfficeItem({ isManager: true });
    expect(back?.href).toBe('/dashboard');
    expect(back?.backOffice).toBe(true);
  });
});
