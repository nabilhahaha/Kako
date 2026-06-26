import type { Metadata } from 'next';
import { requirePermission } from '@/lib/erp/guards';
import { PosSetup } from './pos-setup';
import { PrintSettingsCard } from '../print-settings-card';

export const metadata: Metadata = { title: 'VANTORA — POS Setup' };

/** Fast Food POS — setup (product images + receipt print settings). Manager gate
 *  (restaurant.manage). Theme comes from the POS shell; this page just needs its own padding. */
export default async function PosSetupPage() {
  const ctx = await requirePermission('restaurant.manage');
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PrintSettingsCard companyId={ctx.companyId ?? ''} />
      <PosSetup />
    </div>
  );
}
