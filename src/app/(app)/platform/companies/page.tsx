import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { getPlatformContext, hasPlatformPermission } from '@/lib/erp/platform-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import type { Company } from '@/lib/erp/types';
import { CompaniesManager, type CompanyRow } from './companies-manager';
import { getT } from '@/lib/i18n/server';

export default async function PlatformCompaniesPage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const pctx = await getPlatformContext();

  if (!hasPlatformPermission(pctx, 'view_companies')) {
    return (
      <div>
        <PageHeader title={t('platform.overview.title')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('platform.ownerOnly')}
          </CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: companies }, { data: branches }, { data: userBranches }, { data: btModules }, { data: btRoleRows }, { data: roleRows }] = await Promise.all([
    supabase.from('erp_companies').select('*').order('created_at', { ascending: true }),
    supabase.from('erp_branches').select('id, company_id'),
    supabase.from('erp_user_branches').select('user_id, branch_id'),
    supabase.from('erp_business_type_modules').select('business_type, module'),
    supabase.from('erp_business_type_roles').select('business_type, role_key'),
    supabase.from('erp_roles').select('key, name_ar').order('rank', { ascending: false }),
  ]);

  // business type → its default modules / role template (to prefill the create form).
  const btDefaults: Record<string, string[]> = {};
  for (const r of (btModules as { business_type: string; module: string }[]) ?? []) {
    (btDefaults[r.business_type] ??= []).push(r.module);
  }
  const btRoles: Record<string, string[]> = {};
  for (const r of (btRoleRows as { business_type: string; role_key: string }[]) ?? []) {
    (btRoles[r.business_type] ??= []).push(r.role_key);
  }
  const roleLabels: Record<string, string> = Object.fromEntries(((roleRows as { key: string; name_ar: string }[]) ?? []).map((r) => [r.key, r.name_ar]));

  const branchToCompany = new Map<string, string>();
  const branchCount = new Map<string, number>();
  for (const b of (branches as { id: string; company_id: string }[]) ?? []) {
    branchToCompany.set(b.id, b.company_id);
    branchCount.set(b.company_id, (branchCount.get(b.company_id) ?? 0) + 1);
  }
  const usersByCompany = new Map<string, Set<string>>();
  for (const ub of (userBranches as { user_id: string; branch_id: string }[]) ?? []) {
    const companyId = branchToCompany.get(ub.branch_id);
    if (!companyId) continue;
    let set = usersByCompany.get(companyId);
    if (!set) {
      set = new Set<string>();
      usersByCompany.set(companyId, set);
    }
    set.add(ub.user_id);
  }

  const rows: CompanyRow[] = ((companies as Company[]) ?? []).map((c) => ({
    company: c,
    branches: branchCount.get(c.id) ?? 0,
    users: usersByCompany.get(c.id)?.size ?? 0,
  }));

  return (
    <div>
      <PageHeader
        title={t('platform.companies.title')}
        description={t('platform.companies.description')}
      />
      <Suspense fallback={null}>
        <CompaniesManager rows={rows} btDefaults={btDefaults} btRoles={btRoles} roleLabels={roleLabels} />
      </Suspense>
    </div>
  );
}
