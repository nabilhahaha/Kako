import type { Metadata } from 'next';
import { requirePermission } from '@/lib/erp/guards';
import { PosSetup } from './pos-setup';

export const metadata: Metadata = { title: 'VANTORA — POS Setup' };

/** Fast Food POS — setup (product images). Admin/cashier-manager gate (restaurant.manage). */
export default async function PosSetupPage() {
  await requirePermission('restaurant.manage');
  // Theme comes from the POS shell; this back-office page just needs its own padding.
  return <div className="p-4 sm:p-6"><PosSetup /></div>;
}
