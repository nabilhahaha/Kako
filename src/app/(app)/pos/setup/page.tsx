import type { Metadata } from 'next';
import { requirePermission } from '@/lib/erp/guards';
import { PosSetup } from './pos-setup';

export const metadata: Metadata = { title: 'VANTORA — POS Setup' };

/** Fast Food POS — setup (product images). Admin/cashier-manager gate (restaurant.manage). */
export default async function PosSetupPage() {
  await requirePermission('restaurant.manage');
  return <div className="food-theme"><PosSetup /></div>;
}
