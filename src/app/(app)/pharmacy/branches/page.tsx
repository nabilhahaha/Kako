import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { BranchesManager, type BranchWarehouse } from './branches-manager';
import { branchStock } from './actions';

export const dynamic = 'force-dynamic';

/** Multi-branch stock visibility + transfers. */
export default async function PharmacyBranchesPage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const perms = ctx.permissions as string[];
  if (!(perms.includes('inventory.view') || perms.includes('inventory.transfer') || ctx.isSuperAdmin)) redirect('/dashboard');

  const supabase = await createClient();
  const flags = await getFeatureFlags(supabase, ctx.companyId);
  if (flags['pharmacy.multi_branch'] !== true) redirect('/pharmacy/dashboard');

  const { data: whs } = await supabase
    .from('erp_warehouses')
    .select('id, code, branch:erp_branches!inner(id, name, name_ar, company_id, is_active)')
    .eq('branch.company_id', ctx.companyId).eq('branch.is_active', true).eq('is_active', true)
    .order('code');
  type WRow = { id: string; code: string; branch: { id: string; name: string; name_ar: string | null } | null };
  // One primary warehouse per branch (first by code).
  const seen = new Set<string>();
  const branchWarehouses: BranchWarehouse[] = [];
  for (const w of ((whs as WRow[] | null) ?? [])) {
    if (!w.branch || seen.has(w.branch.id)) continue;
    seen.add(w.branch.id);
    branchWarehouses.push({ branch_id: w.branch.id, branch_name: w.branch.name, branch_name_ar: w.branch.name_ar, warehouse_id: w.id });
  }

  const initial = await branchStock('');
  const canTransfer = perms.includes('inventory.transfer') || ctx.isSuperAdmin;

  return (
    <div>
      <PageHeader title={t('pharmBranches.title')} description={t('pharmBranches.description')} />
      <BranchesManager initialRows={initial} branchWarehouses={branchWarehouses} canTransfer={canTransfer} />
    </div>
  );
}
