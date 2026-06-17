import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { CustomerTransferForm } from './customer-transfer-form';

/**
 * Customer Transfer REQUEST screen — exposes the existing transferCustomer action
 * (no new backend). Submits with requireApproval=true so it lands in the unified
 * Approval Queue for a manager (customer.transfer) to approve.
 */
export const dynamic = 'force-dynamic';

export default async function CustomerTransferPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'customer.transfer')) redirect('/customers');

  const supabase = await createClient();
  const [{ data: customers }, { data: branches }] = await Promise.all([
    supabase.from('erp_customers').select('id, name, name_ar').order('name').limit(1000),
    supabase.from('erp_branches').select('id, name, name_ar').order('name').limit(200),
  ]);

  return (
    <CustomerTransferForm
      customers={(customers ?? []) as Array<{ id: string; name: string; name_ar: string | null }>}
      branches={(branches ?? []) as Array<{ id: string; name: string; name_ar: string | null }>}
    />
  );
}
