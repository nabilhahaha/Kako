import { describe, it, expect } from 'vitest';
import { permissionsForRole, type Permission } from './permissions';
import type { BranchRole } from './types';

/**
 * MJ-1 regression guard. Financial/stock POSTING server actions now enforce a
 * SPECIFIC permission (previously only requireAuth(), so any branch member could
 * post). This pins the contract:
 *   • each gate permission is real,
 *   • low-privilege roles (viewer/staff) CANNOT pass any gate,
 *   • admin/manager (ALL) and the intended operational roles CAN,
 *   • separation of duties holds (a requesting rep cannot approve their own load).
 * If a future change widens a role or renames a permission, this test fails.
 */
const GATES: Record<string, Permission[]> = {
  createInvoice: ['sales.sell'],
  issueInvoice: ['sales.sell'],
  recordPayment: ['sales.collect'],
  quickSale: ['sales.sell'],
  postVoucher: ['accounting.post'],
  createVoucher: ['accounting.post'],
  completeReturn: ['sales.return', 'sales.sell'],
  receivePurchaseOrder: ['purchasing.manage'],
  recordSupplierPayment: ['accounting.post', 'suppliers.manage'],
  adjustStock: ['inventory.adjust', 'stock.adjust'],
  finalizeStockCount: ['inventory.count'],
  completeTransfer: ['inventory.transfer', 'stock.transfer.approve'],
  approveStockRequest: ['stock_request.approve'],
};

const can = (role: BranchRole, perms: Permission[]) => {
  const held = new Set(permissionsForRole(role));
  return perms.some((p) => held.has(p));
};

describe('MJ-1 posting-action permission gates', () => {
  it('low-privilege roles cannot pass any posting gate; admin/manager always can', () => {
    for (const [action, perms] of Object.entries(GATES)) {
      expect(can('viewer', perms), `${action} must block viewer`).toBe(false);
      expect(can('staff', perms), `${action} must block staff`).toBe(false);
      expect(can('admin', perms), `${action} allows admin`).toBe(true);
      expect(can('manager', perms), `${action} allows manager`).toBe(true);
    }
  });

  it('intended operational roles can still perform their action (no flow breakage)', () => {
    expect(can('salesman', GATES.createInvoice)).toBe(true);
    expect(can('salesman', GATES.recordPayment)).toBe(true);
    expect(can('cashier', GATES.quickSale)).toBe(true);
    expect(can('accountant', GATES.postVoucher)).toBe(true);
    expect(can('accountant', GATES.recordSupplierPayment)).toBe(true);
    expect(can('warehouse_keeper', GATES.adjustStock)).toBe(true);
    expect(can('warehouse_keeper', GATES.finalizeStockCount)).toBe(true);
    expect(can('warehouse_keeper', GATES.completeTransfer)).toBe(true);
    expect(can('warehouse_keeper', GATES.approveStockRequest)).toBe(true);
    expect(can('warehouse_keeper', GATES.receivePurchaseOrder)).toBe(true);
  });

  it('separation of duties: a rep who can REQUEST a load cannot APPROVE it', () => {
    expect(permissionsForRole('salesman')).toContain('stock_request.create');
    expect(can('salesman', GATES.approveStockRequest)).toBe(false);
  });
});
