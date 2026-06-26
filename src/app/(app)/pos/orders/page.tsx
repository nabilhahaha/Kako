import type { Metadata } from 'next';
import { requirePermission } from '@/lib/erp/guards';
import { PosOrders } from './pos-orders';

export const metadata: Metadata = { title: 'VANTORA — POS Orders' };

/** Fast Food POS — recent orders (cashier-accessible, restaurant.manage). Read-only view of the
 *  ZATCA-ready invoice ledger; rendered inside the dedicated POS shell. */
export default async function PosOrdersPage() {
  await requirePermission('restaurant.manage');
  return <div className="p-4 sm:p-6"><PosOrders /></div>;
}
