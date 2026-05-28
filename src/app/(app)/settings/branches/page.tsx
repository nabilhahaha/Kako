import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import type { Branch, Company } from '@/lib/erp/types';
import { CompanyForm } from './company-form';
import { BranchManager } from './branch-manager';

export default async function BranchesPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  if (!ctx.isSuperAdmin) {
    return (
      <div>
        <PageHeader title="الفروع" />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            هذه الصفحة متاحة لمدير النظام فقط.
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
          title="إعداد الشركة"
          description="ابدأ بإنشاء بيانات الشركة قبل إضافة الفروع"
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
        title="الفروع"
        description={`إدارة فروع ${company.name_ar || company.name}`}
      />
      <BranchManager
        company={company}
        branches={(branches as Branch[]) ?? []}
      />
    </div>
  );
}
