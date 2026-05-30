import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import type { Branch, Company } from '@/lib/erp/types';
import { getT } from '@/lib/i18n/server';
import { CompanyForm } from './company-form';
import { BranchManager } from './branch-manager';

export default async function BranchesPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();

  if (!ctx.isSuperAdmin) {
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
  const { data: companies } = await supabase
    .from('erp_companies')
    .select('*')
    .order('created_at', { ascending: true });

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

  return (
    <div>
      <PageHeader
        title={t('settings.branches.pageTitle')}
        description={t('settings.branches.pageDescription', { name: company.name_ar || company.name })}
      />
      <BranchManager
        company={company}
        branches={(branches as Branch[]) ?? []}
      />
    </div>
  );
}
