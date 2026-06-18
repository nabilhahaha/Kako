import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import type { Branch, Company } from '@/lib/erp/types';
import { getT } from '@/lib/i18n/server';
import { CompanyForm } from './company-form';
import { BranchesWorkbench } from './branches-workbench';

export default async function BranchesPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();

  // A tenant Company Admin (settings.branches) manages their OWN company's
  // branches; a platform super-admin manages any. Company creation stays the
  // setup-only flow (never shown to an existing tenant). RLS + the server
  // actions pin every write to the caller's own company.
  const canManageBranches =
    ctx.isSuperAdmin || (ctx.permissions as string[]).includes('settings.branches');
  if (!canManageBranches) {
    return (
      <div>
        <PageHeader title={t('settings.branches.pageTitle')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('settings.branches.superAdminOnly')}
          </CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  // A tenant admin is scoped to their OWN company; a super-admin sees all.
  const companyQuery = supabase.from('erp_companies').select('*');
  if (!ctx.isSuperAdmin && ctx.companyId) companyQuery.eq('id', ctx.companyId);
  const { data: companies } = await companyQuery.order('created_at', { ascending: true });

  const company = (companies?.[0] as Company | undefined) ?? null;

  if (!company) {
    return (
      <div>
        <PageHeader
          title={t('settings.branches.setupTitle')}
          description={t('settings.branches.setupDescription')}
        />
        <CompanyForm />
      </div>
    );
  }

  const { data: branches } = await supabase
    .from('erp_branches')
    .select('*')
    .eq('company_id', company.id)
    .order('created_at', { ascending: true });

  const branchList = (branches as Branch[]) ?? [];
  const branchIds = branchList.map((b) => b.id);
  let members: { user_id: string; branch_id: string; role: string; name: string }[] = [];
  if (branchIds.length > 0) {
    const { data: ubs } = await supabase
      .from('erp_user_branches')
      .select('user_id, branch_id, role')
      .in('branch_id', branchIds);
    const ids = [...new Set((ubs ?? []).map((u) => u.user_id as string))];
    const nameById = new Map<string, string>();
    if (ids.length > 0) {
      const { data: profiles } = await supabase.from('erp_profiles').select('id, full_name, email').in('id', ids);
      for (const p of profiles ?? []) nameById.set(p.id as string, (p.full_name as string) || (p.email as string) || (p.id as string));
    }
    members = (ubs ?? []).map((u) => ({
      user_id: u.user_id as string, branch_id: u.branch_id as string, role: u.role as string,
      name: nameById.get(u.user_id as string) ?? (u.user_id as string),
    }));
  }

  return (
    <div>
      <PageHeader
        title={t('settings.branches.pageTitle')}
        description={t('settings.branches.pageDescription', { name: company.name_ar || company.name })}
      />
      <BranchesWorkbench company={company} branches={branchList} members={members} />
    </div>
  );
}
