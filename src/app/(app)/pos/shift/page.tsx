import type { Metadata } from 'next';
import { requirePermission } from '@/lib/erp/guards';
import { PosShift } from './pos-shift';

export const metadata: Metadata = { title: 'VANTORA — POS Shift' };

/** Fast Food POS — shift summary for the current cashier (today's sales). Cashier-accessible
 *  (restaurant.manage); read-only over the invoice ledger; rendered inside the POS shell. */
export default async function PosShiftPage() {
  await requirePermission('restaurant.manage');
  return <div className="p-4 sm:p-6"><PosShift /></div>;
}
