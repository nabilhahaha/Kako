import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import type { Branch, Company, Profile } from '@/lib/erp/types';
import { CompanyDetail, type MemberRow } from './company-detail';
import { CompanyPermissions, type CompanyRoleRow } from './company-permissions';

export default async function PlatformCompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
  const { data: company } = await supabase
    .from('erp_companies')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!company) notFound();

  const { data: branches } = await supabase
    .from('erp_branches')
    .select('*')
    .eq('company_id', id)
    .order('created_at', { ascending: true });

  const branchList = (branches as Branch[]) ?? [];
  const branchIds = branchList.map((b) => b.id);

  let members: MemberRow[] = [];
  if (branchIds.length > 0) {
    const { data: ubs } = await supabase
      .from('erp_user_branches')
      .select('user_id, branch_id, role, is_default')
      .in('branch_id', branchIds);
    const userIds = [...new Set((ubs ?? []).map((u) => u.user_id as string))];
    let profileById = new Map<string, Profile>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('erp_profiles')
        .select('*')
        .in('id', userIds);
      profileById = new Map(((profiles as Profile[]) ?? []).map((p) => [p.id, p]));
    }
    const branchById = new Map(branchList.map((b) => [b.id, b]));
    members = (ubs ?? []).map((u) => ({
      userId: u.user_id as string,
      branchId: u.branch_id as string,
      branchName:
        branchById.get(u.branch_id as string)?.name_ar ||
        branchById.get(u.branch_id as string)?.name ||
        '',
      role: u.role as string,
      isDefault: u.is_default as boolean,
      fullName: profileById.get(u.user_id as string)?.full_name ?? null,
      email: profileById.get(u.user_id as string)?.email ?? null,
    }));
  }

  // Per-company roles & permissions config.
  const [{ data: rolesData }, { data: companyRolesData }, { data: companyPermsData }] =
    await Promise.all([
      supabase.from('erp_roles').select('key, name_ar, is_system, rank').order('rank', { ascending: false }),
      supabase.from('erp_company_roles').select('role_key, enabled').eq('company_id', id),
      supabase.from('erp_company_role_permissions').select('role_key, permission').eq('company_id', id),
    ]);

  const roles = (rolesData as CompanyRoleRow[]) ?? [];
  const enabledRoles = (companyRolesData ?? [])
    .filter((r) => r.enabled)
    .map((r) => r.role_key as string);
  const permsByRole: Record<string, string[]> = {};
  for (const rp of companyPermsData ?? []) {
    (permsByRole[rp.role_key as string] ??= []).push(rp.permission as string);
  }
  const roleNameByKey = new Map(roles.map((r) => [r.key, r.name_ar]));
  const companyRoleOptions = enabledRoles.map((key) => ({
    key,
    name_ar: roleNameByKey.get(key) ?? key,
  }));

  return (
    <div>
      <PageHeader
        title={(company as Company).name_ar || (company as Company).name}
        description="إدارة الاشتراك والفروع والمستخدمين والصلاحيات لهذه الشركة"
      />
      <CompanyDetail
        company={company as Company}
        branches={branchList}
        members={members}
        companyRoles={companyRoleOptions}
      />
      <div className="mt-6">
        <CompanyPermissions
          companyId={id}
          roles={roles}
          enabledRoles={enabledRoles}
          permsByRole={permsByRole}
        />
      </div>
    </div>
  );
}
