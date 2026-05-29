import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import type { Company } from '@/lib/erp/types';
import { CompaniesManager, type CompanyRow } from './companies-manager';

export default async function PlatformCompaniesPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  if (!ctx.isPlatformOwner) {
    return (
      <div>
        <PageHeader title="لوحة المزوّد" />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            هذه الصفحة متاحة لمالك المنصّة فقط.
          </CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: companies }, { data: branches }, { data: userBranches }, { data: btModules }] = await Promise.all([
    supabase.from('erp_companies').select('*').order('created_at', { ascending: true }),
    supabase.from('erp_branches').select('id, company_id'),
    supabase.from('erp_user_branches').select('user_id, branch_id'),
    supabase.from('erp_business_type_modules').select('business_type, module'),
  ]);

  // business type → its default modules (to prefill the create form).
  const btDefaults: Record<string, string[]> = {};
  for (const r of (btModules as { business_type: string; module: string }[]) ?? []) {
    (btDefaults[r.business_type] ??= []).push(r.module);
  }

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
        title="الشركات والاشتراكات"
        description="إضافة الشركات (المستأجرين)، إدارة اشتراكاتها وقفلها عند الانتهاء"
      />
      <CompaniesManager rows={rows} btDefaults={btDefaults} />
    </div>
  );
}
